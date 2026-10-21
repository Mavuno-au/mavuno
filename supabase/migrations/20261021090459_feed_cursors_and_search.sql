-- Feed cursors, publish order and search ranking.
--
-- 1. Every list of posts pages on its sort key and the row's id. Scheduled
--    posts due in the same minute are published in one transaction, so they
--    share a timestamp; paging on the timestamp alone skipped the rest of
--    such a group whenever a page ended inside it.
-- 2. Latest and Following sort by when a post was published, so a post held
--    for review and approved later appears at the top instead of under
--    everything posted while it waited. The key is the later of when a post
--    was written and published: a post is never published before it is
--    written, so that is its publication time, or for the viewer's own post
--    still waiting for review, when it was written.
-- 3. Post search ranks by relevance blended with recency, and every way it
--    matches has an index.
-- 4. Indexes for Latest and for trending topics.
--
-- Under row level security only leakproof conditions can be index
-- conditions. Comparing timestamps and ids is leakproof; coalesce() is not,
-- and SQL function bodies are planned without knowing whether the cursor is
-- null. So each list bounds its sort key with a CASE, which can reach the
-- index either way, and the row comparison settles ties.

-- ---------------------------------------------------------------------------
-- 1. Indexes
-- ---------------------------------------------------------------------------

-- The rows in_feed() can admit, in Latest's order. in_feed() itself can't be
-- an index predicate (it reads auth.uid()), so Latest and Following repeat
-- its status test where the planner can match it to this index.
create index posts_feed_idx on public.posts (greatest(published_at, created_at) desc, id desc)
  where parent_id is null and deleted_at is null and status in ('published', 'pending');

-- Substring matches in post search ("jollof" inside "#jollofwars").
create index posts_body_trgm_idx on public.posts using gin (lower(body) extensions.gin_trgm_ops);

-- trending_topics reads the last few days of published posts.
create index posts_published_idx on public.posts (published_at)
  where deleted_at is null and status = 'published';

-- ---------------------------------------------------------------------------
-- 2. Home feeds, sorted by publication
-- ---------------------------------------------------------------------------

drop function public.feed_following(timestamptz, integer);
drop function public.feed_latest(timestamptz, integer);

create function public.feed_following(p_before timestamptz default null, p_before_id uuid default null, p_limit integer default 20)
returns setof public.post_details
language sql
stable
set search_path = ''
as $$
  select d.* from public.post_details d
  where d.parent_id is null and d.deleted_at is null
    and d.status in ('published', 'pending') and public.in_feed(d.status, d.created_by)
    and not d.author_muted
    and (d.author_id = auth.uid() or d.author_id in (select followee_id from public.follows where follower_id = auth.uid()))
    and greatest(d.published_at, d.created_at) <= case when p_before is null then 'infinity' else p_before end
    and (p_before is null or (greatest(d.published_at, d.created_at), d.id) < (p_before, p_before_id))
  order by greatest(d.published_at, d.created_at) desc, d.id desc
  limit least(greatest(p_limit, 1), 50)
$$;

create function public.feed_latest(p_before timestamptz default null, p_before_id uuid default null, p_limit integer default 20)
returns setof public.post_details
language sql
stable
set search_path = ''
as $$
  select d.* from public.post_details d
  where d.parent_id is null and d.deleted_at is null
    and d.status in ('published', 'pending') and public.in_feed(d.status, d.created_by)
    and not d.author_muted and public.viewer_reads_language(d.language)
    and greatest(d.published_at, d.created_at) <= case when p_before is null then 'infinity' else p_before end
    and (p_before is null or (greatest(d.published_at, d.created_at), d.id) < (p_before, p_before_id))
  order by greatest(d.published_at, d.created_at) desc, d.id desc
  limit least(greatest(p_limit, 1), 50)
$$;

-- Counts in the same order as the feeds above: p_since is the publication
-- time of the newest post on screen.
create or replace function public.count_new_posts(p_feed text, p_since timestamptz)
returns integer
language sql
stable
set search_path = ''
as $$
  select count(*)::integer from public.post_details d
  where d.parent_id is null and d.deleted_at is null and d.status = 'published'
    and greatest(d.published_at, d.created_at) > p_since and d.created_by is distinct from auth.uid() and not d.author_muted
    and case p_feed
      when 'following' then d.author_id in (select followee_id from public.follows where follower_id = auth.uid())
      else public.viewer_reads_language(d.language)
    end
$$;

-- ---------------------------------------------------------------------------
-- 3. Other lists, newest first
-- ---------------------------------------------------------------------------

drop function public.feed_space(uuid, timestamptz, integer);
drop function public.feed_topic(text, timestamptz, integer);
drop function public.feed_local(smallint, integer, timestamptz, integer);
drop function public.feed_profile(uuid, text, timestamptz, integer);
drop function public.feed_saved(timestamptz, integer);

create function public.feed_space(p_space_id uuid, p_before timestamptz default null, p_before_id uuid default null, p_limit integer default 20)
returns setof public.post_details
language sql
stable
set search_path = ''
as $$
  select d.* from public.post_details d
  where d.space_id = p_space_id and d.parent_id is null and d.deleted_at is null
    and public.in_feed(d.status, d.created_by) and not d.author_muted
    and d.created_at <= case when p_before is null then 'infinity' else p_before end
    and (p_before is null or (d.created_at, d.id) < (p_before, p_before_id))
  order by d.created_at desc, d.id desc
  limit least(greatest(p_limit, 1), 50)
$$;

create function public.feed_topic(p_topic text, p_before timestamptz default null, p_before_id uuid default null, p_limit integer default 20)
returns setof public.post_details
language sql
stable
set search_path = ''
as $$
  select d.* from public.post_details d
  where d.topics @> array[lower(p_topic)] and d.deleted_at is null and d.status = 'published' and not d.author_muted
    and d.created_at <= case when p_before is null then 'infinity' else p_before end
    and (p_before is null or (d.created_at, d.id) < (p_before, p_before_id))
  order by d.created_at desc, d.id desc
  limit least(greatest(p_limit, 1), 50)
$$;

-- Posts from members whose city is within the radius of a city.
create function public.feed_local(p_city_id smallint, p_radius_km integer default 80, p_before timestamptz default null, p_before_id uuid default null, p_limit integer default 20)
returns setof public.post_details
language sql
stable
set search_path = ''
as $$
  select d.* from public.post_details d
  join public.profiles a on a.id = d.author_id
  where d.parent_id is null and d.deleted_at is null and d.status = 'published' and not d.author_muted
    and a.city_id is not null and public.city_distance_km(a.city_id, p_city_id) <= p_radius_km
    and d.created_at <= case when p_before is null then 'infinity' else p_before end
    and (p_before is null or (d.created_at, d.id) < (p_before, p_before_id))
  order by d.created_at desc, d.id desc
  limit least(greatest(p_limit, 1), 50)
$$;

-- A profile's posts, replies or posts with images. Muted people's profiles
-- still show their posts.
create function public.feed_profile(p_profile_id uuid, p_kind text default 'posts', p_before timestamptz default null, p_before_id uuid default null, p_limit integer default 20)
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
    and d.created_at <= case when p_before is null then 'infinity' else p_before end
    and (p_before is null or (d.created_at, d.id) < (p_before, p_before_id))
  order by d.created_at desc, d.id desc
  limit least(greatest(p_limit, 1), 50)
$$;

create function public.feed_saved(p_before timestamptz default null, p_before_id uuid default null, p_limit integer default 20)
returns table (saved_at timestamptz, post jsonb)
language sql
stable
set search_path = ''
as $$
  select s.created_at, to_jsonb(d)
  from public.saves s
  join public.post_details d on d.id = s.post_id
  where s.user_id = auth.uid() and d.deleted_at is null
    and s.created_at <= case when p_before is null then 'infinity' else p_before end
    and (p_before is null or (s.created_at, s.post_id) < (p_before, p_before_id))
  order by s.created_at desc, s.post_id desc
  limit least(greatest(p_limit, 1), 50)
$$;

-- ---------------------------------------------------------------------------
-- 4. Replies, oldest first
-- ---------------------------------------------------------------------------

drop function public.post_replies(uuid, timestamptz, integer);

-- Replies and quotes of a post. Deleted replies stay as tombstones only when
-- something visible hangs under them, and the post that continues a thread
-- is read as part of it rather than among its replies.
create function public.post_replies(p_post_id uuid, p_after timestamptz default null, p_after_id uuid default null, p_limit integer default 20)
returns setof public.post_details
language sql
stable
set search_path = ''
as $$
  select d.* from public.post_details d
  where (d.parent_id = p_post_id or d.quote_id = p_post_id)
    and not d.author_muted
    and d.id is distinct from (select c.id from public.continuation_ids(p_post_id, 1) c)
    and (
      (d.deleted_at is null and public.in_feed(d.status, d.created_by))
      or (d.deleted_at is not null and d.parent_id = p_post_id and exists (
        select 1 from public.posts c where c.parent_id = d.id and c.deleted_at is null and c.status = 'published'
      ))
    )
    and d.created_at >= case when p_after is null then '-infinity' else p_after end
    and (p_after is null or (d.created_at, d.id) > (p_after, p_after_id))
  order by d.created_at, d.id
  limit least(greatest(p_limit, 1), 50)
$$;

-- ---------------------------------------------------------------------------
-- 5. Who liked a post
-- ---------------------------------------------------------------------------

drop function public.post_likers(uuid, timestamptz, integer);

-- Likes are otherwise private to the person who liked. The author (or the
-- team of the organisation it was posted as) sees who liked it, newest first,
-- without anyone on either side of a block or muted by the viewer.
create function public.post_likers(p_post_id uuid, p_before timestamptz default null, p_before_id uuid default null, p_limit integer default 30)
returns table (
  liked_at timestamptz, id uuid, username text, display_name text, avatar_url text, colour smallint, bio text, headline text,
  account_type public.account_type, org_verified boolean, followers_count integer, following boolean, follows_you boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_author uuid;
begin
  select p.author_id into v_author from public.posts p where p.id = p_post_id and p.deleted_at is null;
  if v_author is null or not public.can_act_as(v_author) then
    raise exception 'Only the author can see who liked a post' using errcode = '42501';
  end if;

  return query
  select l.created_at, pr.id, pr.username, pr.display_name, pr.avatar_url, public.profile_colour(pr.colour, pr.id), pr.bio, pr.headline,
    pr.account_type, pr.org_verified, pr.followers_count,
    exists (select 1 from public.follows f where f.follower_id = auth.uid() and f.followee_id = pr.id),
    exists (select 1 from public.follows f where f.follower_id = pr.id and f.followee_id = auth.uid())
  from public.likes l
  join public.profiles pr on pr.id = l.user_id
  where l.post_id = p_post_id
    and not public.is_blocked_with_viewer(pr.id)
    and not public.is_blocked_between(v_author, pr.id)
    and not public.is_muted_by_viewer(pr.id)
    and (p_before is null or (l.created_at, pr.id) < (p_before, p_before_id))
  order by l.created_at desc, pr.id desc
  limit least(greatest(p_limit, 1), 50);
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Post search, by relevance and recency
-- ---------------------------------------------------------------------------

drop function public.search_posts(text, timestamptz, integer);

-- A post's score for a search: log2 of how well it matches plus one for every
-- 30 days since it was posted. That ranks the same as relevance halving every
-- 30 days, but a post's score never changes, so it pages like Trending: after
-- the score and id of the last result. A match on a whole word ranks by
-- ts_rank_cd (scaled into 0 to 1); a match only inside a word gets the
-- floor of 0.05, about four months behind a strong word match. Rounding makes
-- the score read back exactly as a cursor.
create function public.search_score(p_body text, p_query tsquery, p_created_at timestamptz)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select round((
    ln(ts_rank_cd(to_tsvector('simple', p_body), p_query, 32) + 0.05) / ln(2.0)
    + extract(epoch from p_created_at) / 2592000.0
  )::numeric, 6)
$$;

-- The page of matching ids. Text matching isn't leakproof, so under row level
-- security neither the full-text nor the trigram index could be used; this
-- reads posts as their owner instead, and only ever returns published posts,
-- which everyone can read. Mutes and blocks are applied before the page is
-- cut so a page is only short at the end.
create function public.search_matches(p_query text, p_after_score numeric, p_after_id uuid, p_limit integer)
returns table (id uuid, score numeric)
language sql
stable
security definer
set search_path = ''
as $$
  with matched as (
    select p.id, public.search_score(p.body, websearch_to_tsquery('simple', p_query), p.created_at) as score
    from public.posts p
    where char_length(trim(p_query)) between 3 and 100
      and p.deleted_at is null and p.status = 'published'
      and (
        to_tsvector('simple', p.body) @@ websearch_to_tsquery('simple', p_query)
        or lower(p.body) like public.like_pattern(p_query)
      )
      and not public.is_muted_by_viewer(p.author_id)
      and not public.is_blocked_with_viewer(p.author_id)
      and not public.is_blocked_with_viewer(p.created_by)
  )
  select matched.id, matched.score from matched
  where p_after_score is null or (matched.score, matched.id) < (p_after_score, p_after_id)
  order by matched.score desc, matched.id desc
  limit least(greatest(p_limit, 1), 50)
$$;

create function public.search_posts(p_query text, p_after_score numeric default null, p_after_id uuid default null, p_limit integer default 20)
returns table (search_score numeric, post jsonb)
language sql
stable
set search_path = ''
as $$
  select m.score, to_jsonb(d)
  from public.search_matches(p_query, p_after_score, p_after_id, p_limit) m
  join public.post_details d on d.id = m.id
  order by m.score desc, m.id desc
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

revoke all on function
  public.feed_following(timestamptz, uuid, integer),
  public.feed_latest(timestamptz, uuid, integer),
  public.feed_space(uuid, timestamptz, uuid, integer),
  public.feed_topic(text, timestamptz, uuid, integer),
  public.feed_local(smallint, integer, timestamptz, uuid, integer),
  public.feed_profile(uuid, text, timestamptz, uuid, integer),
  public.feed_saved(timestamptz, uuid, integer),
  public.post_replies(uuid, timestamptz, uuid, integer),
  public.post_likers(uuid, timestamptz, uuid, integer),
  public.search_score(text, tsquery, timestamptz),
  public.search_matches(text, numeric, uuid, integer),
  public.search_posts(text, numeric, uuid, integer)
from public, anon, authenticated;

-- search_posts calls search_matches as the requesting role.
grant execute on function
  public.feed_latest(timestamptz, uuid, integer),
  public.feed_space(uuid, timestamptz, uuid, integer),
  public.feed_topic(text, timestamptz, uuid, integer),
  public.feed_local(smallint, integer, timestamptz, uuid, integer),
  public.feed_profile(uuid, text, timestamptz, uuid, integer),
  public.post_replies(uuid, timestamptz, uuid, integer),
  public.search_matches(text, numeric, uuid, integer),
  public.search_posts(text, numeric, uuid, integer)
to anon, authenticated;

grant execute on function
  public.feed_following(timestamptz, uuid, integer),
  public.feed_saved(timestamptz, uuid, integer),
  public.post_likers(uuid, timestamptz, uuid, integer)
to authenticated;
