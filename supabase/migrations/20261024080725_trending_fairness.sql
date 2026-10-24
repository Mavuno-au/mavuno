-- Trending that one person, or a handful of throwaway accounts, cannot fill:
--
-- 1. Likes and replies from accounts under a week old count a quarter, so a
--    few fresh sign-ups cannot lift a post on their own.
-- 2. An open report from a member with standing keeps a post out of
--    Trending until a moderator decides, and nobody sees a post they
--    reported in their own feeds.
-- 3. Each author's second post in a draw counts half as much, and the rest a
--    quarter, so a prolific morning does not take the whole first page.
--    Trending's week also starts from when a post went up, not when it was
--    written, as the score already does.

-- ---------------------------------------------------------------------------
-- 1. Engagement from new accounts
-- ---------------------------------------------------------------------------

-- A like or reply counts a quarter when the account that made it was under a
-- week old at the time. The age is fixed at the moment of engagement rather
-- than taken from reporter_has_standing, which reads several tables and
-- changes over time: a score that only moves when engagement does stays
-- cheap and never needs a schedule.
create or replace function public.refresh_hot_score(p_post_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.posts p set hot_score = ln(1 + coalesce((
      select sum(weight) from (
        select person, max(weight) as weight from (
          select e.person, e.weight * case when e.at >= pr.created_at + interval '7 days' then 1.0 else 0.25 end as weight
          from (
            select l.user_id as person, 1 as weight, l.created_at as at from public.likes l where l.post_id = p.id
            union all
            select l.user_id, 1, l.created_at from public.likes l
            join public.posts r on r.id = l.post_id
            where r.root_id = p.id and r.status = 'published' and r.deleted_at is null
            union all
            select r.created_by, 3, r.created_at from public.posts r
            where (r.root_id = p.id or r.quote_id = p.id) and r.status = 'published' and r.deleted_at is null
          ) e
          join public.profiles pr on pr.id = e.person
          where e.person is distinct from p.created_by
        ) weighted
        group by person
      ) w
    ), 0)) / ln(2) + extract(epoch from coalesce(p.published_at, p.created_at)) / 86400.0
  where p.id = p_post_id
$$;

-- Trending only draws from the last week, so only those scores need to be on
-- the new scale before the next visit.
do $$
begin
  perform public.refresh_hot_score(p.id) from public.posts p
  where p.parent_id is null and p.deleted_at is null and p.status = 'published'
    and coalesce(p.published_at, p.created_at) > now() - interval '7 days';
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Reports, read from the feeds
-- ---------------------------------------------------------------------------

-- Only moderators read reports, and the feeds run as the viewer, so each
-- answer is a single yes or no about one post.
create function public.post_has_standing_report(p_post_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.reports
    where target_type = 'post' and target_id = p_post_id and status = 'open' and reporter_standing
  )
$$;

-- Any report the viewer filed, whatever became of it: someone who reported
-- a post does not want it back after a moderator lets it stand.
create function public.is_reported_by_viewer(p_post_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null and exists (
    select 1 from public.reports
    where reporter_id = auth.uid() and target_type = 'post' and target_id = p_post_id
  )
$$;

revoke all on function
  public.post_has_standing_report(uuid),
  public.is_reported_by_viewer(uuid)
from public, anon, authenticated;

grant execute on function
  public.post_has_standing_report(uuid),
  public.is_reported_by_viewer(uuid)
to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Trending: one author at a time, no reported posts, by publication
-- ---------------------------------------------------------------------------

-- The draw weight is 4^score, so taking 0.5 from an author's second post
-- halves its chance and taking 1 from the rest quarters it. The cut is made
-- to the score that is returned: the cursor compares against it, so a page
-- after it continues the same draw.
create or replace function public.feed_trending(
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
  with raw as (
    select p.id, p.author_id, public.trending_score(p.hot_score, p.id, p_seed) as score
    from public.posts p
    where p.parent_id is null and p.deleted_at is null and p.status = 'published'
      and coalesce(p.published_at, p.created_at) > now() - interval '7 days'
      and not public.is_muted_by_viewer(p.author_id)
      and not public.is_blocked_with_viewer(p.author_id)
      and not public.is_blocked_with_viewer(p.created_by)
      and public.viewer_reads_language(p.language)
      and not public.is_reported_by_viewer(p.id)
      and not public.post_has_standing_report(p.id)
  ),
  drawn as (
    select raw.id,
      raw.score - least(0.5 * (row_number() over (partition by raw.author_id order by raw.score desc, raw.id desc) - 1), 1.0) as score
    from raw
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
-- 4. Following and Latest: not what the viewer reported
-- ---------------------------------------------------------------------------

create or replace function public.feed_following(p_before timestamptz default null, p_before_id uuid default null, p_limit integer default 20)
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
    and not public.is_reported_by_viewer(d.id)
    and greatest(d.published_at, d.created_at) <= case when p_before is null then 'infinity' else p_before end
    and (p_before is null or (greatest(d.published_at, d.created_at), d.id) < (p_before, p_before_id))
  order by greatest(d.published_at, d.created_at) desc, d.id desc
  limit least(greatest(p_limit, 1), 50)
$$;

create or replace function public.feed_latest(p_before timestamptz default null, p_before_id uuid default null, p_limit integer default 20)
returns setof public.post_details
language sql
stable
set search_path = ''
as $$
  select d.* from public.post_details d
  where d.parent_id is null and d.deleted_at is null
    and d.status in ('published', 'pending') and public.in_feed(d.status, d.created_by)
    and not d.author_muted and public.viewer_reads_language(d.language)
    and not public.is_reported_by_viewer(d.id)
    and greatest(d.published_at, d.created_at) <= case when p_before is null then 'infinity' else p_before end
    and (p_before is null or (greatest(d.published_at, d.created_at), d.id) < (p_before, p_before_id))
  order by greatest(d.published_at, d.created_at) desc, d.id desc
  limit least(greatest(p_limit, 1), 50)
$$;
