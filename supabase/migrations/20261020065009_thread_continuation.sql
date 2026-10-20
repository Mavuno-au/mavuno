-- Thread continuation: when an author replies to their own post, their
-- earliest published reply continues it as a thread, and that reply's earliest
-- such reply continues it in turn. A post's page reads the thread in order
-- under it; elsewhere a continued post links to its page.

-- The posts that continue a post, in order. Only the author's published,
-- undeleted replies count, so the thread reads the same for everyone who can
-- see the post.
create function public.continuation_ids(p_post_id uuid, p_limit integer)
returns table (id uuid, depth integer)
language sql
stable
security invoker
set search_path = ''
as $$
  with recursive chain as (
    select p.id, p.author_id, 0 as depth
    from public.posts p
    where p.id = p_post_id and p.deleted_at is null and p.author_id is not null
    union all
    select next.id, next.author_id, chain.depth + 1
    from chain
    cross join lateral (
      select r.id, r.author_id from public.posts r
      where r.parent_id = chain.id and r.author_id = chain.author_id
        and r.status = 'published' and r.deleted_at is null
      order by r.created_at, r.id
      limit 1
    ) next
    where chain.depth < p_limit
  )
  select chain.id, chain.depth from chain where chain.depth > 0
$$;

-- continuation_count counts at most 101 posts: past 100 the page only says
-- the thread has more.
create or replace view public.post_details
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
  ) as translation,
  case when p.deleted_at is null then (
    select count(*)::integer from public.continuation_ids(p.id, 101)
  ) else 0 end as continuation_count
from public.posts p
where not public.is_blocked_with_viewer(p.author_id);

-- The next posts of a post's thread, a page at a time: the page after one
-- that ends at post X is the thread of X. The thread stops at the first post
-- the viewer cannot see, and is hidden when they muted the author.
create function public.post_continuation(p_post_id uuid, p_limit integer default 10)
returns setof public.post_details
language sql
stable
security invoker
set search_path = ''
as $$
  select (shown.d).* from (
    select d, c.depth, bool_and(d.id is not null and not d.author_muted) over (order by c.depth) as reachable
    from public.continuation_ids(p_post_id, least(greatest(p_limit, 0), 50)) c
    left join public.post_details d on d.id = c.id
  ) shown
  where shown.reachable
  order by shown.depth
$$;

-- Where a post sits in its author's thread: 1 when it continues nothing, and
-- one more for each post above it that it continues.
create function public.thread_position(p_post_id uuid)
returns integer
language sql
stable
security invoker
set search_path = ''
as $$
  with recursive up as (
    select p.id, p.parent_id, p.author_id, 1 as position
    from public.posts p
    where p.id = p_post_id and p.deleted_at is null
    union all
    select parent.id, parent.parent_id, parent.author_id, up.position + 1
    from up
    join public.posts parent on parent.id = up.parent_id
    where parent.author_id = up.author_id and parent.deleted_at is null and up.position < 1000
      and up.id = (select c.id from public.continuation_ids(parent.id, 1) c)
  )
  select max(up.position) from up
$$;

-- The post that continues a post is read as part of its thread, not among its
-- replies.
create or replace function public.post_replies(p_post_id uuid, p_after timestamptz default null, p_limit integer default 20)
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
    and (p_after is null or d.created_at > p_after)
  order by d.created_at
  limit least(p_limit, 50)
$$;

revoke all on function
  public.continuation_ids(uuid, integer),
  public.post_continuation(uuid, integer),
  public.thread_position(uuid)
from public, anon, authenticated;

-- post_details calls continuation_ids as the requesting role.
grant execute on function
  public.continuation_ids(uuid, integer),
  public.post_continuation(uuid, integer),
  public.thread_position(uuid)
to anon, authenticated;
