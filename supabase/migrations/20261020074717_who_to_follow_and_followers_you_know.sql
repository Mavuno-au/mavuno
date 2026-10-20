-- Who to follow pages through two pools: the viewer's network (people followed
-- by people they follow, most shared follows first) and the 20 best of everyone
-- else (nearby and shared interests first, then the most followed). The app
-- mixes and orders them with a seed per member per day, so suggestions don't
-- reshuffle on every page. Reasons are the same as suggested_profiles gives.
create function public.suggestion_pool(p_network_limit integer default 30)
returns table (
  id uuid, username text, display_name text, avatar_url text, colour smallint, bio text, headline text,
  account_type public.account_type, org_verified boolean, followers_count integer, city text,
  follows_you boolean, reason text, source text
)
language sql
stable
security definer
set search_path = ''
as $$
  with me as (
    select p.id, p.city_id, p.interests from public.profiles p where p.id = auth.uid()
  ),
  candidates as (
    select
      p.*,
      (select count(*) from public.follows f1
         join public.follows f2 on f2.followee_id = p.id and f2.follower_id = f1.followee_id
         where f1.follower_id = auth.uid() and not public.is_muted_by_viewer(f1.followee_id)) as mutuals,
      coalesce(cardinality(array(select unnest(p.interests) intersect select unnest(me.interests))), 0) as shared,
      coalesce(p.city_id = me.city_id, false) as same_city
    from public.profiles p
    join public.profile_settings s on s.id = p.id
    join me on true
    where p.id <> me.id
      and s.discoverable and (s.suspended_until is null or s.suspended_until < now())
      and not exists (select 1 from public.follows f where f.follower_id = me.id and f.followee_id = p.id)
      and not public.is_blocked_with_viewer(p.id) and not public.is_muted_by_viewer(p.id)
  ),
  ranked as (
    select
      c.*,
      case when c.mutuals > 0 then 'network' else 'popular' end as source,
      row_number() over (
        partition by c.mutuals > 0
        order by c.mutuals desc, c.shared * 2 + c.same_city::int * 4 desc, c.followers_count desc, c.created_at desc
      ) as rank
    from candidates c
  )
  select
    r.id, r.username, r.display_name, r.avatar_url, public.profile_colour(r.colour, r.id), r.bio, r.headline,
    r.account_type, r.org_verified, r.followers_count,
    (select ci.name from public.cities ci where ci.id = r.city_id),
    exists (select 1 from public.follows f where f.follower_id = r.id and f.followee_id = auth.uid()),
    case
      when r.mutuals = 1 then 'Followed by 1 person you follow'
      when r.mutuals > 1 then 'Followed by ' || r.mutuals || ' people you follow'
      when r.same_city and r.shared > 0 then 'Near you, with shared interests'
      when r.same_city then 'In your city'
      when r.shared > 0 then 'Shares your interests'
      when r.followers_count = 1 then '1 follower'
      else r.followers_count || ' followers'
    end,
    r.source
  from ranked r
  where r.rank <= case when r.source = 'network' then least(p_network_limit, 50) else 20 end
  order by r.source, r.rank
$$;

-- "Followed by A, B and 3 others you follow": people the viewer follows who
-- follow the profile, best known first. `total` counts all of them.
create function public.followers_you_know(p_profile_id uuid, p_limit integer default 3)
returns table (id uuid, username text, display_name text, avatar_url text, colour smallint, total bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.username, p.display_name, p.avatar_url, public.profile_colour(p.colour, p.id), count(*) over ()
  from public.follows mine
  join public.follows theirs on theirs.follower_id = mine.followee_id and theirs.followee_id = p_profile_id
  join public.profiles p on p.id = mine.followee_id
  where mine.follower_id = auth.uid()
    and p.id <> p_profile_id
    and not public.is_blocked_with_viewer(p.id) and not public.is_muted_by_viewer(p.id)
  order by p.followers_count desc, theirs.created_at desc
  limit least(p_limit, 10)
$$;

revoke all on function public.suggestion_pool(integer), public.followers_you_know(uuid, integer) from public, anon;
grant execute on function public.suggestion_pool(integer), public.followers_you_know(uuid, integer) to authenticated;
