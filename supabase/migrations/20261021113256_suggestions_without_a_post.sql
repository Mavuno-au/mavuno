-- Suggestions no longer require a post. While the network is small, most
-- members haven't posted yet, and once someone follows those who have there
-- is nobody left to suggest. People who have posted (and verified
-- organisations) still come first; everyone discoverable is in the pool.
-- Both functions are otherwise as people_and_discovery defined them.

create or replace function public.suggested_profiles(p_limit integer default 5, p_account_type public.account_type default null)
returns table (
  id uuid, username text, display_name text, avatar_url text, colour smallint, bio text, headline text,
  account_type public.account_type, org_verified boolean, followers_count integer, city text,
  follows_you boolean, reason text
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
         where f1.follower_id = auth.uid()) as mutuals,
      coalesce(cardinality(array(select unnest(p.interests) intersect select unnest(me.interests))), 0) as shared,
      coalesce(p.city_id = me.city_id, false) as same_city
    from public.profiles p
    join public.profile_settings s on s.id = p.id
    left join me on true
    where p.id is distinct from auth.uid()
      and s.discoverable and public.is_listed(p.id)
      and (p_account_type is null or p.account_type = p_account_type)
      and not exists (select 1 from public.follows f where f.follower_id = auth.uid() and f.followee_id = p.id)
      and not exists (select 1 from public.suggestion_dismissals d where d.user_id = auth.uid() and d.dismissed_id = p.id)
      and not public.is_blocked_with_viewer(p.id) and not public.is_muted_by_viewer(p.id)
  )
  select
    c.id, c.username, c.display_name, c.avatar_url, public.profile_colour(c.colour, c.id), c.bio, c.headline,
    c.account_type, c.org_verified, c.followers_count,
    (select ci.name from public.cities ci where ci.id = c.city_id),
    exists (select 1 from public.follows f where f.follower_id = c.id and f.followee_id = auth.uid()),
    case
      when c.mutuals = 1 then 'Followed by 1 person you follow'
      when c.mutuals > 1 then 'Followed by ' || c.mutuals || ' people you follow'
      when c.same_city and c.shared > 0 then 'Near you, with shared interests'
      when c.same_city then 'In your city'
      when c.shared > 0 then 'Shares your interests'
      when c.followers_count = 1 then '1 follower'
      else c.followers_count || ' followers'
    end
  from candidates c
  order by (c.org_verified or c.posts_count > 0) desc, c.mutuals * 3 + c.shared * 2 + c.same_city::int * 4 desc, c.followers_count desc, c.created_at desc
  limit least(p_limit, 50)
$$;

create or replace function public.suggestion_pool(p_network_limit integer default 30)
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
      and s.discoverable and public.is_listed(p.id)
      and not exists (select 1 from public.follows f where f.follower_id = me.id and f.followee_id = p.id)
      and not exists (select 1 from public.suggestion_dismissals d where d.user_id = me.id and d.dismissed_id = p.id)
      and not public.is_blocked_with_viewer(p.id) and not public.is_muted_by_viewer(p.id)
  ),
  ranked as (
    select
      c.*,
      case when c.mutuals > 0 then 'network' else 'popular' end as source,
      row_number() over (
        partition by c.mutuals > 0
        order by c.mutuals desc, (c.org_verified or c.posts_count > 0) desc, c.shared * 2 + c.same_city::int * 4 desc, c.followers_count desc, c.created_at desc
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
