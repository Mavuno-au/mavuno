-- Read models: post details, feeds, threads, discovery, search, notifications,
-- data export and account deletion.
--
-- Mutes hide people from feeds, threads, search, suggestions and notifications,
-- but their profile stays visitable. Blocks hide both sides from each other.

create function public.profile_card(p_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'id', p.id, 'username', p.username, 'display_name', p.display_name, 'avatar_url', p.avatar_url,
    'colour', public.profile_colour(p.colour, p.id), 'account_type', p.account_type,
    'org_verified', p.org_verified, 'headline', p.headline,
    'city', (select c.name from public.cities c where c.id = p.city_id)
  )
  from public.profiles p where p.id = p_id
$$;

-- A post with everything a row needs. Content of deleted posts is already gone;
-- poll results show to the author, to voters and once the poll has closed.
create view public.post_details
with (security_invoker = true)
as
select
  p.id,
  p.author_id,
  p.created_by,
  p.status,
  p.body,
  p.language,
  p.parent_id,
  p.root_id,
  p.quote_id,
  p.space_id,
  p.link_url,
  p.link_preview,
  p.topics,
  p.moderation_note,
  p.reply_count,
  p.like_count,
  p.quote_count,
  p.hot_score,
  p.published_at,
  p.deleted_at,
  p.created_at,
  case when p.deleted_at is null then public.profile_card(p.author_id) end as author,
  public.is_muted_by_viewer(p.author_id) as author_muted,
  (
    select case when pp.deleted_at is null then pa.username end
    from public.posts pp left join public.profiles pa on pa.id = pp.author_id
    where pp.id = p.parent_id
  ) as parent_username,
  case when p.deleted_at is null then (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', i.id, 'url', i.url, 'width', i.width, 'height', i.height, 'alt', i.alt_text
    ) order by i.position), '[]'::jsonb)
    from public.post_images i where i.post_id = p.id
  ) else '[]'::jsonb end as images,
  (
    select jsonb_build_object(
      'closes_at', pl.closes_at,
      'duration_hours', pl.duration_hours,
      'votes_count', pl.votes_count,
      'my_vote', v.option_id,
      'show_results', v.option_id is not null or pl.closes_at < now() or p.created_by = auth.uid() or public.can_act_as(p.author_id),
      'options', (
        select jsonb_agg(jsonb_build_object(
          'id', o.id, 'label', o.label,
          'votes_count', case when v.option_id is not null or pl.closes_at < now() or p.created_by = auth.uid() or public.can_act_as(p.author_id) then o.votes_count end
        ) order by o.position)
        from public.poll_options o where o.post_id = pl.post_id
      )
    )
    from public.polls pl
    left join public.poll_votes v on v.post_id = pl.post_id and v.user_id = auth.uid()
    where pl.post_id = p.id and p.deleted_at is null
  ) as poll,
  case when p.quote_id is not null then coalesce((
    select case
      when q.deleted_at is not null then jsonb_build_object('id', q.id, 'deleted', true)
      when public.is_blocked_with_viewer(q.author_id) then jsonb_build_object('id', q.id, 'unavailable', true)
      else jsonb_build_object(
        'id', q.id, 'body', q.body, 'created_at', q.created_at, 'language', q.language,
        'author', public.profile_card(q.author_id),
        'image', (select jsonb_build_object('url', i.url, 'alt', i.alt_text) from public.post_images i where i.post_id = q.id order by i.position limit 1)
      )
    end
    from public.posts q where q.id = p.quote_id
  ), jsonb_build_object('id', p.quote_id, 'unavailable', true)) end as quoted,
  (
    select jsonb_build_object(
      'id', e.id, 'title', e.title, 'starts_at', e.starts_at, 'timezone', e.timezone, 'format', e.format,
      'venue_name', e.venue_name, 'city', (select c.name from public.cities c where c.id = e.city_id),
      'going_count', e.going_count, 'cancelled', e.cancelled_at is not null
    )
    from public.events e where e.id = p.event_id
  ) as event,
  (
    select jsonb_build_object(
      'id', o.id, 'title', o.title, 'type', o.type, 'organisation_name', o.organisation_name,
      'deadline_at', o.deadline_at, 'is_remote', o.is_remote,
      'city', (select c.name from public.cities c where c.id = o.city_id), 'closed', o.closed_at is not null
    )
    from public.opportunities o where o.id = p.opportunity_id
  ) as opportunity,
  (select jsonb_build_object('slug', s.slug, 'name', s.name, 'emoji', s.emoji) from public.spaces s where s.id = p.space_id) as space,
  exists (select 1 from public.likes l where l.post_id = p.id and l.user_id = auth.uid()) as liked,
  exists (select 1 from public.saves s where s.post_id = p.id and s.user_id = auth.uid()) as saved,
  (
    select t.body from public.post_translations t
    where t.post_id = p.id and t.created_at > now() - interval '7 days'
      and t.target_language = coalesce((select s.translation_language from public.profile_settings s where s.id = auth.uid()), '')
  ) as translation
from public.posts p
where not public.is_blocked_with_viewer(p.author_id);

-- Shown in feeds: published, or the viewer's own post waiting for review.
create function public.in_feed(p_status public.content_status, p_created_by uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select p_status = 'published' or (p_status = 'pending' and p_created_by = auth.uid())
$$;

create function public.viewer_reads_language(p_language text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select not s.feed_languages_only or cardinality(p.languages) = 0 or p_language = any (p.languages)
    from public.profiles p join public.profile_settings s on s.id = p.id
    where p.id = auth.uid()
  ), true)
$$;

-- Following: top-level posts (quotes included) from people and organisations
-- the viewer follows, and their own.
create function public.feed_following(p_before timestamptz default null, p_limit integer default 20)
returns setof public.post_details
language sql
stable
set search_path = ''
as $$
  select d.* from public.post_details d
  where d.parent_id is null and d.deleted_at is null and public.in_feed(d.status, d.created_by)
    and not d.author_muted
    and (d.author_id = auth.uid() or d.author_id in (select followee_id from public.follows where follower_id = auth.uid()))
    and (p_before is null or d.created_at < p_before)
  order by d.created_at desc
  limit least(p_limit, 50)
$$;

create function public.feed_latest(p_before timestamptz default null, p_limit integer default 20)
returns setof public.post_details
language sql
stable
set search_path = ''
as $$
  select d.* from public.post_details d
  where d.parent_id is null and d.deleted_at is null and public.in_feed(d.status, d.created_by)
    and not d.author_muted and public.viewer_reads_language(d.language)
    and (p_before is null or d.created_at < p_before)
  order by d.created_at desc
  limit least(p_limit, 50)
$$;

create function public.feed_trending(p_offset integer default 0, p_limit integer default 20)
returns setof public.post_details
language sql
stable
set search_path = ''
as $$
  select d.* from public.post_details d
  where d.parent_id is null and d.deleted_at is null and d.status = 'published'
    and d.created_at > now() - interval '7 days'
    and not d.author_muted and public.viewer_reads_language(d.language)
  order by d.hot_score desc, d.created_at desc
  offset greatest(p_offset, 0)
  limit least(p_limit, 50)
$$;

-- How many newer posts a feed has, for the "N new posts" control.
create function public.count_new_posts(p_feed text, p_since timestamptz)
returns integer
language sql
stable
set search_path = ''
as $$
  select count(*)::integer from public.post_details d
  where d.parent_id is null and d.deleted_at is null and d.status = 'published'
    and d.created_at > p_since and d.created_by is distinct from auth.uid() and not d.author_muted
    and case p_feed
      when 'following' then d.author_id in (select followee_id from public.follows where follower_id = auth.uid())
      else public.viewer_reads_language(d.language)
    end
$$;

create function public.feed_space(p_space_id uuid, p_before timestamptz default null, p_limit integer default 20)
returns setof public.post_details
language sql
stable
set search_path = ''
as $$
  select d.* from public.post_details d
  where d.space_id = p_space_id and d.parent_id is null and d.deleted_at is null
    and public.in_feed(d.status, d.created_by) and not d.author_muted
    and (p_before is null or d.created_at < p_before)
  order by d.created_at desc
  limit least(p_limit, 50)
$$;

create function public.feed_topic(p_topic text, p_before timestamptz default null, p_limit integer default 20)
returns setof public.post_details
language sql
stable
set search_path = ''
as $$
  select d.* from public.post_details d
  where d.topics @> array[lower(p_topic)] and d.deleted_at is null and d.status = 'published' and not d.author_muted
    and (p_before is null or d.created_at < p_before)
  order by d.created_at desc
  limit least(p_limit, 50)
$$;

-- Posts from members whose city is within the radius of a city.
create function public.feed_local(p_city_id smallint, p_radius_km integer default 80, p_before timestamptz default null, p_limit integer default 20)
returns setof public.post_details
language sql
stable
set search_path = ''
as $$
  select d.* from public.post_details d
  join public.profiles a on a.id = d.author_id
  where d.parent_id is null and d.deleted_at is null and d.status = 'published' and not d.author_muted
    and a.city_id is not null and public.city_distance_km(a.city_id, p_city_id) <= p_radius_km
    and (p_before is null or d.created_at < p_before)
  order by d.created_at desc
  limit least(p_limit, 50)
$$;

-- A profile's posts, replies or posts with images. Muted people's profiles
-- still show their posts.
create function public.feed_profile(p_profile_id uuid, p_kind text default 'posts', p_before timestamptz default null, p_limit integer default 20)
returns setof public.post_details
language sql
stable
set search_path = ''
as $$
  select d.* from public.post_details d
  where d.author_id = p_profile_id and d.deleted_at is null and d.status <> 'rejected'
    and case p_kind
      when 'replies' then d.parent_id is not null
      when 'media' then jsonb_array_length(d.images) > 0
      else d.parent_id is null
    end
    and (p_before is null or d.created_at < p_before)
  order by d.created_at desc
  limit least(p_limit, 50)
$$;

create function public.feed_saved(p_before timestamptz default null, p_limit integer default 20)
returns table (saved_at timestamptz, post jsonb)
language sql
stable
set search_path = ''
as $$
  select s.created_at, to_jsonb(d)
  from public.saves s
  join public.post_details d on d.id = s.post_id
  where s.user_id = auth.uid() and d.deleted_at is null
    and (p_before is null or s.created_at < p_before)
  order by s.created_at desc
  limit least(p_limit, 50)
$$;

-- Replies and quotes of a post, oldest first. Deleted replies stay as
-- tombstones only when something visible hangs under them.
create function public.post_replies(p_post_id uuid, p_after timestamptz default null, p_limit integer default 20)
returns setof public.post_details
language sql
stable
set search_path = ''
as $$
  select d.* from public.post_details d
  where (d.parent_id = p_post_id or d.quote_id = p_post_id)
    and not d.author_muted
    and (
      (d.deleted_at is null and public.in_feed(d.status, d.created_by))
      or (d.deleted_at is not null and d.parent_id = p_post_id and exists (
        select 1 from public.posts c where c.parent_id = d.id and c.deleted_at is null and c.status = 'published'
      ))
    )
    and (p_after is null or d.created_at > p_after)
  order by d.created_at
  limit least(p_limit, 50)
$$;

create function public.post_ancestors(p_post_id uuid)
returns setof public.post_details
language sql
stable
set search_path = ''
as $$
  with recursive chain as (
    select p.parent_id as id, 1 as depth from public.posts p where p.id = p_post_id
    union all
    select p.parent_id, c.depth + 1 from public.posts p join chain c on p.id = c.id
    where c.id is not null and c.depth < 20
  )
  select d.* from chain c join public.post_details d on d.id = c.id
  order by c.depth desc
$$;

-- ---------------------------------------------------------------------------
-- Discovery
-- ---------------------------------------------------------------------------

create function public.trending_topics(p_days integer default 7, p_limit integer default 10)
returns table (topic text, post_count bigint, people_count bigint)
language sql
stable
set search_path = ''
as $$
  select t.topic, count(*), count(distinct p.author_id)
  from public.posts p, unnest(p.topics) as t(topic)
  where p.published_at > now() - make_interval(days => p_days)
    and p.deleted_at is null and p.status = 'published'
  group by t.topic
  order by count(distinct p.author_id) desc, count(*) desc
  limit least(p_limit, 50)
$$;

-- Who to follow: people followed by people the viewer follows, shared city and
-- interests, then the most followed. Only discoverable, active profiles.
create function public.suggested_profiles(p_limit integer default 5, p_account_type public.account_type default null)
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
      and s.discoverable and (s.suspended_until is null or s.suspended_until < now())
      and (p_account_type is null or p.account_type = p_account_type)
      and not exists (select 1 from public.follows f where f.follower_id = auth.uid() and f.followee_id = p.id)
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

-- People near a city. Only discoverable profiles with a city appear, and only
-- the city and a distance band are shown, never a precise location.
create function public.nearby_profiles(p_city_id smallint, p_radius_km integer default 80, p_interest text default null, p_limit integer default 30)
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
  where s.discoverable and (s.suspended_until is null or s.suspended_until < now())
    and p.id is distinct from auth.uid()
    and public.city_distance_km(p.city_id, p_city_id) <= least(p_radius_km, 200)
    and (p_interest is null or p.interests @> array[lower(p_interest)])
    and not public.is_blocked_with_viewer(p.id) and not public.is_muted_by_viewer(p.id)
  order by (p.city_id = p_city_id) desc, p.followers_count desc, p.created_at desc
  limit least(p_limit, 100)
$$;

create function public.nearby_city_ids(p_city_id smallint, p_radius_km integer default 80)
returns smallint[]
language sql
stable
set search_path = ''
as $$
  select coalesce(array_agg(c.id), '{}') from public.cities c
  where public.city_distance_km(c.id, p_city_id) <= least(p_radius_km, 200)
$$;

-- ---------------------------------------------------------------------------
-- Search
-- ---------------------------------------------------------------------------

create function public.like_pattern(p_query text)
returns text
language sql
immutable
set search_path = ''
as $$
  select '%' || replace(replace(replace(lower(trim(p_query)), '\', '\\'), '%', '\%'), '_', '\_') || '%'
$$;

create function public.search_profiles(p_query text, p_limit integer default 20)
returns table (
  id uuid, username text, display_name text, avatar_url text, colour smallint, bio text, headline text,
  account_type public.account_type, org_verified boolean, followers_count integer
)
language sql
stable
set search_path = ''
as $$
  select p.id, p.username, p.display_name, p.avatar_url, public.profile_colour(p.colour, p.id), p.bio, p.headline,
    p.account_type, p.org_verified, p.followers_count
  from public.profiles p
  where char_length(trim(ltrim(p_query, '@'))) >= 1
    and (
      p.username like public.like_pattern(ltrim(p_query, '@'))
      or lower(p.display_name) like public.like_pattern(p_query)
      or extensions.similarity(lower(p.display_name), lower(trim(p_query))) > 0.3
    )
    and not public.is_blocked_with_viewer(p.id) and not public.is_muted_by_viewer(p.id)
  order by (p.username = lower(trim(ltrim(p_query, '@')))) desc,
    extensions.similarity(lower(p.display_name), lower(trim(p_query))) desc,
    p.followers_count desc
  limit least(p_limit, 50)
$$;

create function public.search_posts(p_query text, p_before timestamptz default null, p_limit integer default 20)
returns setof public.post_details
language sql
stable
set search_path = ''
as $$
  select d.* from public.post_details d
  where char_length(trim(p_query)) between 3 and 100
    and d.deleted_at is null and d.status = 'published' and not d.author_muted
    and (
      to_tsvector('simple', d.body) @@ websearch_to_tsquery('simple', p_query)
      or lower(d.body) like public.like_pattern(p_query)
    )
    and (p_before is null or d.created_at < p_before)
  order by d.created_at desc
  limit least(p_limit, 50)
$$;

-- ---------------------------------------------------------------------------
-- Notifications
-- ---------------------------------------------------------------------------

create view public.notification_details
with (security_invoker = true)
as
select
  n.id,
  n.recipient_id,
  n.type,
  n.post_id,
  n.event_id,
  n.message,
  n.read_at,
  n.created_at,
  public.profile_card(n.actor_id) as actor,
  exists (select 1 from public.follows f where f.follower_id = n.recipient_id and f.followee_id = n.actor_id) as following_actor,
  (
    select jsonb_build_object('id', p.id, 'body', left(p.body, 400), 'parent_id', p.parent_id, 'root_id', p.root_id, 'quote_id', p.quote_id)
    from public.posts p where p.id = n.post_id
  ) as post,
  (select jsonb_build_object('id', e.id, 'title', e.title, 'starts_at', e.starts_at) from public.events e where e.id = n.event_id) as event
from public.notifications n
where not public.is_blocked_with_viewer(n.actor_id)
  and not public.is_muted_by_viewer(n.actor_id)
  and not exists (select 1 from public.posts p where p.id = n.post_id and p.deleted_at is not null);

create function public.unread_notification_count()
returns integer
language sql
stable
set search_path = ''
as $$
  select count(*)::integer from public.notification_details
  where recipient_id = auth.uid() and read_at is null
$$;

-- ---------------------------------------------------------------------------
-- Data export and account deletion
-- ---------------------------------------------------------------------------

create function public.export_my_data()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'exported_at', now(),
    'profile', (select to_jsonb(p) from public.profiles p where p.id = auth.uid()),
    'settings', (select to_jsonb(s) - 'site_role' from public.profile_settings s where s.id = auth.uid()),
    'organisations', (select coalesce(jsonb_agg(jsonb_build_object('username', o.username, 'role', m.role, 'since', m.created_at)), '[]')
      from public.organisation_members m join public.profiles o on o.id = m.org_id where m.user_id = auth.uid()),
    'posts', (select coalesce(jsonb_agg(to_jsonb(p) - 'hot_score' order by p.created_at), '[]')
      from public.posts p where p.created_by = auth.uid() and p.deleted_at is null),
    'post_images', (select coalesce(jsonb_agg(jsonb_build_object('post_id', i.post_id, 'url', i.url, 'alt', i.alt_text)), '[]')
      from public.post_images i join public.posts p on p.id = i.post_id where p.created_by = auth.uid()),
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
    'spaces', (select coalesce(jsonb_agg(jsonb_build_object('slug', s.slug, 'role', m.role, 'since', m.joined_at)), '[]')
      from public.space_members m join public.spaces s on s.id = m.space_id where m.user_id = auth.uid()),
    'events_hosted', (select coalesce(jsonb_agg(to_jsonb(e)), '[]') from public.events e where e.created_by = auth.uid()),
    'event_rsvps', (select coalesce(jsonb_agg(to_jsonb(r)), '[]') from public.event_rsvps r where r.user_id = auth.uid()),
    'opportunities', (select coalesce(jsonb_agg(to_jsonb(o)), '[]') from public.opportunities o where o.created_by = auth.uid()),
    'saved_opportunities', (select coalesce(jsonb_agg(to_jsonb(s)), '[]') from public.saved_opportunities s where s.user_id = auth.uid()),
    'messages_sent', (select coalesce(jsonb_agg(jsonb_build_object('conversation_id', m.conversation_id, 'body', m.body, 'created_at', m.created_at) order by m.created_at), '[]')
      from public.messages m where m.sender_id = auth.uid()),
    'message_reactions', (select coalesce(jsonb_agg(to_jsonb(r)), '[]') from public.message_reactions r where r.user_id = auth.uid()),
    'notifications', (select coalesce(jsonb_agg(jsonb_build_object('type', n.type, 'created_at', n.created_at, 'read_at', n.read_at, 'message', n.message) order by n.created_at), '[]')
      from public.notifications n where n.recipient_id = auth.uid())
  )
  where auth.uid() is not null
$$;

-- Deletes the signed-in person's account. Their profile, posts (as tombstones),
-- messages, reactions, likes, follows and settings go with it. The app removes
-- their uploaded files first.
create function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Sign in first' using errcode = '42501';
  end if;
  delete from auth.users where id = auth.uid();
end;
$$;

-- Computed column for the API: select=colour:effective_colour
create function public.effective_colour(p public.profiles)
returns smallint
language sql
immutable
set search_path = ''
as $$
  select public.profile_colour(p.colour, p.id)
$$;
