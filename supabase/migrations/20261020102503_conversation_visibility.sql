-- Conversation that is easier to see and to join:
--
-- 1. Trending counts likes on a thread's replies towards the thread.
-- 2. Trending is drawn at random, weighted by the hot score, with a new seed
--    for each visit.
-- 3. Feeds show the newest replies under each post, read for a whole page at once.
-- 4. Authors see who liked their posts. Nobody else does.
-- 5. Mention suggestions start with the people in the conversation.
-- 6. Profile cards for hovering over a name.

-- ---------------------------------------------------------------------------
-- 1. Likes anywhere in a thread count towards it
-- ---------------------------------------------------------------------------

-- Distinct people engaging with a thread: a like on the post or on any of its
-- published replies is worth one, a reply or quote three, each person once,
-- the author excluded. Engagement has to double to keep up with a post three
-- hours newer.
create or replace function public.refresh_hot_score(p_post_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.posts p set hot_score = ln(1 + coalesce((
      select sum(weight) from (
        select person, max(weight) as weight from (
          select l.user_id as person, 1 as weight from public.likes l where l.post_id = p.id
          union all
          select l.user_id, 1 from public.likes l
          join public.posts r on r.id = l.post_id
          where r.root_id = p.id and r.status = 'published' and r.deleted_at is null
          union all
          select r.created_by, 3 from public.posts r
          where (r.root_id = p.id or r.quote_id = p.id) and r.status = 'published' and r.deleted_at is null
        ) e
        where person is distinct from p.created_by
        group by person
      ) w
    ), 0)) / ln(2) + extract(epoch from coalesce(p.published_at, p.created_at)) / 10800.0
  where p.id = p_post_id
$$;

-- Threads whose replies were liked before this counted.
do $$
declare
  v_id uuid;
begin
  for v_id in
    select p.id from public.posts p
    where p.parent_id is null and p.deleted_at is null
      and exists (select 1 from public.posts r join public.likes l on l.post_id = r.id where r.root_id = p.id)
  loop
    perform public.refresh_hot_score(v_id);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Trending, drawn at random
-- ---------------------------------------------------------------------------

-- Adding Gumbel noise, -ln(-ln(u)) for u uniform in (0, 1), to the logarithm
-- of each post's weight and sorting by the sum draws posts at random, each
-- with a chance of coming first in proportion to its weight. The hot score
-- counts doublings, so at a temperature of 0.5 the weight is 2^(hot_score / 0.5):
-- a post with twice the engagement of another ranks above it 4 times out of 5.
-- u comes from hashing the post with the visit's seed, so every page of a
-- visit sorts the same way, and the score is rounded so that it reads back
-- exactly as a cursor. The remainder is taken before abs(), which overflows
-- on the smallest bigint.
create function public.trending_score(p_hot_score double precision, p_id uuid, p_seed bigint)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select round((
    p_hot_score - (0.5 / ln(2.0)) * ln(-ln((abs(hashtextextended(p_id::text, p_seed) % 1000000) + 0.5) / 1000000.0))
  )::numeric, 6)
$$;

drop function public.feed_trending(integer, integer);

-- A page of a visit's draw, after the score and id of the last post shown.
-- Mutes, blocks and languages are applied before the page is cut so a page
-- is only short at the end.
create function public.feed_trending(
  p_seed bigint default 0,
  p_after_score numeric default null,
  p_after_id uuid default null,
  p_limit integer default 20
)
returns table (trending_score numeric, post jsonb)
language sql
stable
set search_path = ''
as $$
  with drawn as (
    select p.id, public.trending_score(p.hot_score, p.id, p_seed) as score
    from public.posts p
    where p.parent_id is null and p.deleted_at is null and p.status = 'published'
      and p.created_at > now() - interval '7 days'
      and not public.is_muted_by_viewer(p.author_id)
      and not public.is_blocked_with_viewer(p.author_id)
      and not public.is_blocked_with_viewer(p.created_by)
      and public.viewer_reads_language(p.language)
  ),
  page as (
    select drawn.id, drawn.score from drawn
    where p_after_score is null or (drawn.score, drawn.id) < (p_after_score, p_after_id)
    order by drawn.score desc, drawn.id desc
    limit least(greatest(p_limit, 1), 50)
  )
  select page.score, to_jsonb(d)
  from page join public.post_details d on d.id = page.id
  order by page.score desc, page.id desc
$$;

-- ---------------------------------------------------------------------------
-- 3. Reply previews
-- ---------------------------------------------------------------------------

-- The newest replies to each of a page of posts, oldest first within a post.
-- Like post_replies, it leaves out the post that continues a thread, people
-- the viewer muted or is blocked with, and anything they cannot see.
-- Deleted replies are left out: a preview never starts with a tombstone.
create function public.reply_previews(p_post_ids uuid[], p_limit integer default 3)
returns setof public.post_details
language sql
stable
set search_path = ''
as $$
  select d.* from unnest(p_post_ids[1:50]) as parent(id)
  cross join lateral (
    select r.id from public.posts r
    where r.parent_id = parent.id and r.deleted_at is null
      and public.in_feed(r.status, r.created_by)
      and not public.is_muted_by_viewer(r.author_id)
      and not public.is_blocked_with_viewer(r.author_id)
      and not public.is_blocked_with_viewer(r.created_by)
      and r.id is distinct from (select c.id from public.continuation_ids(parent.id, 1) c)
    order by r.created_at desc, r.id desc
    limit least(greatest(p_limit, 0), 5)
  ) newest
  join public.post_details d on d.id = newest.id
  order by d.parent_id, d.created_at, d.id
$$;

-- ---------------------------------------------------------------------------
-- 4. Who liked a post, for its author
-- ---------------------------------------------------------------------------

-- Likes are otherwise private to the person who liked. The author (or the
-- team of the organisation it was posted as) sees who liked it, newest first,
-- without anyone on either side of a block or muted by the viewer.
create function public.post_likers(p_post_id uuid, p_before timestamptz default null, p_limit integer default 30)
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
    and (p_before is null or l.created_at < p_before)
  order by l.created_at desc, pr.id desc
  limit least(greatest(p_limit, 1), 50);
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Mention suggestions
-- ---------------------------------------------------------------------------

-- In a reply: the person replied to, the thread's first author, the others in
-- the thread (most recent first), then people the writer follows. In a quote,
-- the quoted author comes first. A bare @ lists only those people; typing also
-- matches everyone else by username or name. Never the writer, or anyone they
-- muted or are blocked with.
create function public.mention_suggestions(
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

-- ---------------------------------------------------------------------------
-- 6. Profile cards
-- ---------------------------------------------------------------------------

-- What a card shows when someone hovers over a name: nothing for anyone on
-- either side of a block with the viewer.
create function public.profile_preview(p_username text)
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
  where p.username = lower(trim(p_username)) and not public.is_blocked_with_viewer(p.id)
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

revoke all on function
  public.trending_score(double precision, uuid, bigint),
  public.feed_trending(bigint, numeric, uuid, integer),
  public.reply_previews(uuid[], integer),
  public.post_likers(uuid, timestamptz, integer),
  public.mention_suggestions(text, uuid, uuid, integer),
  public.profile_preview(text)
from public, anon, authenticated;

-- feed_trending calls trending_score as the requesting role.
grant execute on function
  public.trending_score(double precision, uuid, bigint),
  public.feed_trending(bigint, numeric, uuid, integer),
  public.reply_previews(uuid[], integer),
  public.profile_preview(text)
to anon, authenticated;

grant execute on function
  public.post_likers(uuid, timestamptz, integer),
  public.mention_suggestions(text, uuid, uuid, integer)
to authenticated;
