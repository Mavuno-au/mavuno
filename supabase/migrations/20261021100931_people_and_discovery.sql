-- People and discovery.
--
-- Suspended and age-deactivated accounts keep their profile page but appear in
-- no list of people: search, suggestions, nearby, profile cards, mention
-- suggestions, followers and following. Who to follow only suggests people
-- who have posted (verified organisations excepted) and never anyone the
-- member has dismissed. People search matches headlines and bios too, with
-- indexes it can use. Follower and following lists come from one function
-- that applies blocks before the page is cut and says who follows the viewer.

-- ---------------------------------------------------------------------------
-- 1. Which accounts lists show
-- ---------------------------------------------------------------------------

-- Settings are private, so lists ask here. True unless the account is
-- suspended or deactivated as possibly under 16.
create function public.is_listed(p_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not exists (
    select 1 from public.profile_settings s
    where s.id = p_profile_id
      and (s.suspended_until > now() or s.age_deactivated_at is not null)
  )
$$;

-- ---------------------------------------------------------------------------
-- 2. "Not for me" in Who to follow
-- ---------------------------------------------------------------------------

-- Private to the member who dismissed, in their export, and gone with either
-- account. Dismissing only affects suggestions.
create table public.suggestion_dismissals (
  user_id uuid not null references public.profiles (id) on delete cascade,
  dismissed_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, dismissed_id),
  check (user_id <> dismissed_id)
);

create index suggestion_dismissals_dismissed_idx on public.suggestion_dismissals (dismissed_id);

alter table public.suggestion_dismissals enable row level security;

create policy "People see their own dismissals" on public.suggestion_dismissals
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "People dismiss suggestions as themselves" on public.suggestion_dismissals
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "People take back their dismissals" on public.suggestion_dismissals
  for delete to authenticated using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- 3. Suggestions
-- ---------------------------------------------------------------------------

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
      and (p.org_verified or p.posts_count > 0)
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
      and (p.org_verified or p.posts_count > 0)
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
  order by c.mutuals * 3 + c.shared * 2 + c.same_city::int * 4 desc, c.followers_count desc, c.created_at desc
  limit least(p_limit, 50)
$$;

-- Nearby is a directory, so a profile without posts still belongs in it.
create or replace function public.nearby_profiles(p_city_id smallint, p_radius_km integer default 80, p_interest text default null, p_limit integer default 30)
returns table (
  id uuid, username text, display_name text, avatar_url text, colour smallint, bio text, headline text,
  account_type public.account_type, org_verified boolean, followers_count integer, interests text[],
  city text, distance_band text, following boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    p.id, p.username, p.display_name, p.avatar_url, public.profile_colour(p.colour, p.id), p.bio, p.headline,
    p.account_type, p.org_verified, p.followers_count, p.interests, ci.name,
    case
      when p.city_id = p_city_id then 'Same city'
      when public.city_distance_km(p.city_id, p_city_id) <= 30 then 'Under 30 km'
      else 'Under ' || least(p_radius_km, 200)::text || ' km'
    end,
    exists (select 1 from public.follows f where f.follower_id = auth.uid() and f.followee_id = p.id)
  from public.profiles p
  join public.profile_settings s on s.id = p.id
  join public.cities ci on ci.id = p.city_id
  where s.discoverable and public.is_listed(p.id)
    and p.id is distinct from auth.uid()
    and public.city_distance_km(p.city_id, p_city_id) <= least(p_radius_km, 200)
    and (p_interest is null or p.interests @> array[lower(p_interest)])
    and not public.is_blocked_with_viewer(p.id) and not public.is_muted_by_viewer(p.id)
  order by (p.city_id = p_city_id) desc, p.followers_count desc, p.created_at desc
  limit least(p_limit, 100)
$$;

create or replace function public.followers_you_know(p_profile_id uuid, p_limit integer default 3)
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
    and public.is_listed(p.id)
    and not public.is_blocked_with_viewer(p.id) and not public.is_muted_by_viewer(p.id)
  order by p.followers_count desc, theirs.created_at desc
  limit least(p_limit, 10)
$$;

-- ---------------------------------------------------------------------------
-- 4. People search
-- ---------------------------------------------------------------------------

create index profiles_headline_trgm_idx on public.profiles using gin (lower(headline) extensions.gin_trgm_ops);
create index profiles_bio_trgm_idx on public.profiles using gin (lower(bio) extensions.gin_trgm_ops);

-- Text matching isn't leakproof, so under row level security none of the
-- trigram indexes could be used. Profiles are public, so this reads them as
-- their owner; blocks and mutes are still applied. The @username and the name
-- come first, then people whose headline or bio mentions the words.
create or replace function public.search_profiles(p_query text, p_limit integer default 20)
returns table (
  id uuid, username text, display_name text, avatar_url text, colour smallint, bio text, headline text,
  account_type public.account_type, org_verified boolean, followers_count integer
)
language sql
stable
security definer
set search_path = ''
as $$
  with term as (
    select lower(trim(p_query)) as words, lower(trim(ltrim(p_query, '@'))) as handle, public.like_pattern(p_query) as pattern
  )
  select p.id, p.username, p.display_name, p.avatar_url, public.profile_colour(p.colour, p.id), p.bio, p.headline,
    p.account_type, p.org_verified, p.followers_count
  from public.profiles p, term
  where char_length(term.handle) >= 1
    and (
      p.username like public.like_pattern(term.handle)
      or lower(p.display_name) like term.pattern
      or lower(p.display_name) operator(extensions.%) term.words
      or lower(p.headline) like term.pattern
      or lower(p.bio) like term.pattern
    )
    and public.is_listed(p.id)
    and not public.is_blocked_with_viewer(p.id) and not public.is_muted_by_viewer(p.id)
  order by (p.username = term.handle) desc,
    starts_with(p.username, term.handle) desc,
    (lower(p.display_name) like term.pattern) desc,
    extensions.similarity(lower(p.display_name), term.words) desc,
    p.followers_count desc
  limit least(p_limit, 50)
$$;

-- ---------------------------------------------------------------------------
-- 5. Mention suggestions and profile cards
-- ---------------------------------------------------------------------------

create or replace function public.mention_suggestions(
  p_query text default '',
  p_reply_to uuid default null,
  p_quote_of uuid default null,
  p_limit integer default 6
)
returns table (
  id uuid, username text, display_name text, avatar_url text, colour smallint, bio text, headline text,
  account_type public.account_type, org_verified boolean, followers_count integer
)
language sql
stable
set search_path = ''
as $$
  with term as (
    select lower(ltrim(trim(coalesce(p_query, '')), '@')) as t
  ),
  target as (
    select p.author_id, coalesce(p.root_id, p.id) as root_id
    from public.posts p
    where p.id = coalesce(p_reply_to, p_quote_of) and p.deleted_at is null
  ),
  root as (
    select r.author_id from public.posts r join target on r.id = target.root_id
    where p_reply_to is not null and r.deleted_at is null
  ),
  participants as (
    select t.author_id, max(t.created_at) as last_post
    from public.posts t join target on t.root_id = target.root_id
    where p_reply_to is not null and t.status = 'published' and t.deleted_at is null
    group by t.author_id
  ),
  followed as (
    select f.followee_id, f.created_at from public.follows f where f.follower_id = auth.uid()
  ),
  pool as (
    select pr.id from public.profiles pr, term
    where term.t <> '' and (pr.username like public.like_pattern(term.t) or lower(pr.display_name) like public.like_pattern(term.t))
    union select target.author_id from target
    union select root.author_id from root
    union select participants.author_id from participants
    union select followed.followee_id from followed
  )
  select pr.id, pr.username, pr.display_name, pr.avatar_url, public.profile_colour(pr.colour, pr.id), pr.bio, pr.headline,
    pr.account_type, pr.org_verified, pr.followers_count
  from pool
  join public.profiles pr on pr.id = pool.id
  cross join term
  left join followed f on f.followee_id = pr.id
  left join participants pa on pa.author_id = pr.id
  where pr.id is distinct from auth.uid()
    and (term.t = '' or pr.username like public.like_pattern(term.t) or lower(pr.display_name) like public.like_pattern(term.t))
    and public.is_listed(pr.id)
    and not public.is_blocked_with_viewer(pr.id)
    and not public.is_muted_by_viewer(pr.id)
  order by
    case
      when pr.id = (select target.author_id from target) then 0
      when pr.id = (select root.author_id from root) then 1
      when pa.author_id is not null then 2
      when f.followee_id is not null then 3
      else 4
    end,
    case
      when term.t = '' then 0
      when pr.username = term.t then 0
      when starts_with(pr.username, term.t) then 1
      when starts_with(lower(pr.display_name), term.t) then 2
      else 3
    end,
    pa.last_post desc nulls last,
    f.created_at desc nulls last,
    pr.followers_count desc,
    pr.username
  limit least(greatest(p_limit, 1), 20)
$$;

create or replace function public.profile_preview(p_username text)
returns table (
  id uuid, username text, display_name text, avatar_url text, colour smallint, bio text, headline text,
  account_type public.account_type, org_verified boolean, followers_count integer, following_count integer,
  posts_count integer, following boolean, follows_you boolean, muted boolean
)
language sql
stable
set search_path = ''
as $$
  select p.id, p.username, p.display_name, p.avatar_url, public.profile_colour(p.colour, p.id), p.bio, p.headline,
    p.account_type, p.org_verified, p.followers_count, p.following_count, p.posts_count,
    exists (select 1 from public.follows f where f.follower_id = auth.uid() and f.followee_id = p.id),
    exists (select 1 from public.follows f where f.follower_id = p.id and f.followee_id = auth.uid()),
    public.is_muted_by_viewer(p.id)
  from public.profiles p
  where p.username = lower(trim(p_username)) and public.is_listed(p.id) and not public.is_blocked_with_viewer(p.id)
$$;

-- ---------------------------------------------------------------------------
-- 6. Followers and following
-- ---------------------------------------------------------------------------

-- Newest follow first, paged on the follow time and the person's id. People
-- on either side of a block with the viewer are left out before the page is
-- cut, so a page is only short at the end. Follows and profiles are public.
create function public.profile_connections(
  p_profile_id uuid,
  p_direction text,
  p_before timestamptz default null,
  p_before_id uuid default null,
  p_limit integer default 30
)
returns table (
  id uuid, username text, display_name text, avatar_url text, colour smallint, bio text, headline text,
  account_type public.account_type, org_verified boolean, followers_count integer,
  following boolean, follows_you boolean, followed_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.username, p.display_name, p.avatar_url, public.profile_colour(p.colour, p.id), p.bio, p.headline,
    p.account_type, p.org_verified, p.followers_count,
    exists (select 1 from public.follows v where v.follower_id = auth.uid() and v.followee_id = p.id),
    exists (select 1 from public.follows v where v.follower_id = p.id and v.followee_id = auth.uid()),
    f.created_at
  from public.follows f
  join public.profiles p on p.id = case when p_direction = 'followers' then f.follower_id else f.followee_id end
  where (
      (p_direction = 'followers' and f.followee_id = p_profile_id)
      or (p_direction = 'following' and f.follower_id = p_profile_id)
    )
    and (f.created_at, p.id) < (coalesce(p_before, 'infinity'::timestamptz), coalesce(p_before_id, '00000000-0000-0000-0000-000000000000'::uuid))
    and public.is_listed(p.id)
    and not public.is_blocked_with_viewer(p.id)
  order by f.created_at desc, p.id desc
  limit least(greatest(p_limit, 1), 100)
$$;

-- ---------------------------------------------------------------------------
-- 7. Export
-- ---------------------------------------------------------------------------

-- Dismissed suggestions are part of a member's export.
create or replace function public.export_my_data()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'exported_at', now(),
    'account', (select jsonb_build_object(
        'email', u.email, 'created_at', u.created_at, 'last_sign_in_at', u.last_sign_in_at,
        'providers', (select coalesce(jsonb_agg(distinct i.provider), '[]') from auth.identities i where i.user_id = u.id))
      from auth.users u where u.id = auth.uid()),
    'profile', (select to_jsonb(p) from public.profiles p where p.id = auth.uid()),
    'settings', (select to_jsonb(s) - 'site_role' from public.profile_settings s where s.id = auth.uid()),
    'activity', (select jsonb_build_object('last_seen', a.last_seen) from public.member_activity a where a.id = auth.uid()),
    'organisations', (select coalesce(jsonb_agg(jsonb_build_object('username', o.username, 'role', m.role, 'since', m.created_at)), '[]')
      from public.organisation_members m join public.profiles o on o.id = m.org_id where m.user_id = auth.uid()),
    'posts', (select coalesce(jsonb_agg(to_jsonb(p) - 'hot_score' order by p.created_at), '[]')
      from public.posts p where p.created_by = auth.uid() and p.deleted_at is null),
    'post_images', (select coalesce(jsonb_agg(jsonb_build_object('post_id', i.post_id, 'url', i.url, 'alt', i.alt_text)), '[]')
      from public.post_images i join public.posts p on p.id = i.post_id where p.created_by = auth.uid()),
    'scheduled_posts', (select coalesce(jsonb_agg(to_jsonb(s) - 'created_by' order by s.scheduled_at), '[]')
      from public.scheduled_posts s where s.created_by = auth.uid()),
    'poll_votes', (select coalesce(jsonb_agg(to_jsonb(v)), '[]') from public.poll_votes v where v.user_id = auth.uid()),
    'likes', (select coalesce(jsonb_agg(to_jsonb(l)), '[]') from public.likes l where l.user_id = auth.uid()),
    'saved_posts', (select coalesce(jsonb_agg(to_jsonb(s)), '[]') from public.saves s where s.user_id = auth.uid()),
    'following', (select coalesce(jsonb_agg(jsonb_build_object('username', p.username, 'since', f.created_at)), '[]')
      from public.follows f join public.profiles p on p.id = f.followee_id where f.follower_id = auth.uid()),
    'followers', (select coalesce(jsonb_agg(jsonb_build_object('username', p.username, 'since', f.created_at)), '[]')
      from public.follows f join public.profiles p on p.id = f.follower_id where f.followee_id = auth.uid()),
    'mutes', (select coalesce(jsonb_agg(jsonb_build_object('username', p.username, 'since', m.created_at)), '[]')
      from public.mutes m join public.profiles p on p.id = m.muted_id where m.muter_id = auth.uid()),
    'blocks', (select coalesce(jsonb_agg(jsonb_build_object('username', p.username, 'since', b.created_at)), '[]')
      from public.blocks b join public.profiles p on p.id = b.blocked_id where b.blocker_id = auth.uid()),
    'dismissed_suggestions', (select coalesce(jsonb_agg(jsonb_build_object('username', p.username, 'since', d.created_at)), '[]')
      from public.suggestion_dismissals d join public.profiles p on p.id = d.dismissed_id where d.user_id = auth.uid()),
    'spaces', (select coalesce(jsonb_agg(jsonb_build_object('slug', s.slug, 'role', m.role, 'since', m.joined_at)), '[]')
      from public.space_members m join public.spaces s on s.id = m.space_id where m.user_id = auth.uid()),
    'events_hosted', (select coalesce(jsonb_agg(to_jsonb(e)), '[]') from public.events e where e.created_by = auth.uid()),
    'event_rsvps', (select coalesce(jsonb_agg(to_jsonb(r)), '[]') from public.event_rsvps r where r.user_id = auth.uid()),
    'opportunities', (select coalesce(jsonb_agg(to_jsonb(o)), '[]') from public.opportunities o where o.created_by = auth.uid()),
    'saved_opportunities', (select coalesce(jsonb_agg(to_jsonb(s)), '[]') from public.saved_opportunities s where s.user_id = auth.uid()),
    'conversations', (select coalesce(jsonb_agg(jsonb_build_object(
        'conversation_id', cp.conversation_id, 'status', cp.status, 'role', cp.role, 'archived_at', cp.archived_at,
        'muted', cp.muted, 'last_read_at', cp.last_read_at, 'joined_at', cp.joined_at) order by cp.joined_at), '[]')
      from public.conversation_participants cp where cp.user_id = auth.uid()),
    'messages_sent', (select coalesce(jsonb_agg(jsonb_build_object(
        'conversation_id', m.conversation_id, 'body', m.body, 'image_paths', m.image_paths, 'image_alts', m.image_alts,
        'reply_to_id', m.reply_to_id, 'created_at', m.created_at) order by m.created_at), '[]')
      from public.messages m where m.sender_id = auth.uid()),
    'message_reactions', (select coalesce(jsonb_agg(to_jsonb(r)), '[]') from public.message_reactions r where r.user_id = auth.uid()),
    'notifications', (select coalesce(jsonb_agg(jsonb_build_object(
        'type', n.type, 'actor', a.username, 'post_id', n.post_id, 'created_at', n.created_at, 'read_at', n.read_at,
        'message', n.message) order by n.created_at), '[]')
      from public.notifications n left join public.profiles a on a.id = n.actor_id where n.recipient_id = auth.uid())
  )
  where auth.uid() is not null
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

revoke all on table public.suggestion_dismissals from public, anon, authenticated;
grant select, insert, delete on table public.suggestion_dismissals to authenticated;
grant all on table public.suggestion_dismissals to service_role;

revoke all on function
  public.is_listed(uuid),
  public.profile_connections(uuid, text, timestamptz, uuid, integer),
  public.search_profiles(text, integer),
  public.profile_preview(text),
  public.suggestion_pool(integer),
  public.suggested_profiles(integer, public.account_type),
  public.nearby_profiles(smallint, integer, text, integer),
  public.followers_you_know(uuid, integer),
  public.mention_suggestions(text, uuid, uuid, integer),
  public.export_my_data()
from public, anon, authenticated;

-- mention_suggestions and profile_preview run as the requesting role and ask is_listed.
grant execute on function
  public.is_listed(uuid),
  public.profile_connections(uuid, text, timestamptz, uuid, integer),
  public.search_profiles(text, integer),
  public.profile_preview(text)
to anon, authenticated;

grant execute on function
  public.suggestion_pool(integer),
  public.suggested_profiles(integer, public.account_type),
  public.nearby_profiles(smallint, integer, text, integer),
  public.followers_you_know(uuid, integer),
  public.mention_suggestions(text, uuid, uuid, integer),
  public.export_my_data()
to authenticated;
