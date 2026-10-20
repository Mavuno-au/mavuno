-- Security fixes from a review of the database:
--
-- 1. Only owners and admins edit an organisation's profile and settings;
--    editors still post as it.
-- 2. Blocks also apply to the person who wrote a post, so running an
--    organisation does not get around a block.
-- 3. Group invites count towards the daily limit on message requests.
-- 4. Poll results stay hidden from the API until you vote, as in post_details.
-- 5. Moderators cannot read who filed a report.
-- 6. create_post checks links and images itself, since it can be called
--    directly with the API.
-- 7. Profile links are web addresses.

-- ---------------------------------------------------------------------------
-- 1. Organisation profiles
-- ---------------------------------------------------------------------------

alter policy "People edit profiles they can act as" on public.profiles
  using (id = (select auth.uid()) or public.can_manage_org(id))
  with check (id = (select auth.uid()) or public.can_manage_org(id));

alter policy "Owners edit their settings" on public.profile_settings
  using (id = (select auth.uid()) or public.can_manage_org(id))
  with check (id = (select auth.uid()) or public.can_manage_org(id));

-- ---------------------------------------------------------------------------
-- 2. Blocks follow the writer as well as the profile posted under
-- ---------------------------------------------------------------------------

create or replace function public.can_see_post(p_post_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.posts p
    where p.id = p_post_id and p.deleted_at is null
      and (p.status = 'published' or p.created_by = auth.uid() or public.can_act_as(p.author_id) or public.is_moderator())
      and not public.is_blocked_with_viewer(p.author_id)
      and not public.is_blocked_with_viewer(p.created_by)
  )
$$;

-- Reply, quote and mention notifications come from a post, which may be
-- written by someone the recipient blocked while appearing under an
-- organisation.
create or replace function public.notify(
  p_recipient_id uuid,
  p_actor_id uuid,
  p_type public.notification_type,
  p_post_id uuid default null,
  p_event_id uuid default null,
  p_message text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_recipient_id is null or p_recipient_id = p_actor_id then
    return;
  end if;
  if p_actor_id is not null and (
    public.is_blocked_between(p_recipient_id, p_actor_id)
    or exists (select 1 from public.mutes where muter_id = p_recipient_id and muted_id = p_actor_id)
  ) then
    return;
  end if;
  if p_type in ('reply', 'quote', 'mention')
     and public.is_blocked_between(p_recipient_id, (select created_by from public.posts where id = p_post_id)) then
    return;
  end if;
  if p_type in ('like', 'follow', 'event_rsvp') and exists (
    select 1 from public.notifications
    where recipient_id = p_recipient_id and actor_id = p_actor_id and type = p_type
      and post_id is not distinct from p_post_id and event_id is not distinct from p_event_id
  ) then
    return;
  end if;

  insert into public.notifications (recipient_id, actor_id, type, post_id, event_id, message)
  values (p_recipient_id, p_actor_id, p_type, p_post_id, p_event_id, p_message);
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Group invites are message requests too
-- ---------------------------------------------------------------------------

-- Who sent a pending invite, so every way of reaching strangers shares one
-- daily limit.
alter table public.conversation_participants
  add column requested_by uuid references public.profiles (id) on delete set null;

create index conversation_participants_requested_by_idx
  on public.conversation_participants (requested_by, joined_at);

create function public.limit_message_requests()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'pending' and auth.uid() is not null and new.user_id <> auth.uid() then
    new.requested_by := auth.uid();
    if (
      select count(*) from public.conversation_participants
      where requested_by = new.requested_by and joined_at > now() - interval '1 day'
    ) >= 20 then
      raise exception 'You have sent a lot of message requests today. Try again tomorrow.' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

create trigger conversation_participants_limit_requests before insert on public.conversation_participants
  for each row execute function public.limit_message_requests();

-- ---------------------------------------------------------------------------
-- 4. Poll results
-- ---------------------------------------------------------------------------

-- Option counts are only readable through here, which shows them once the
-- viewer voted, the poll closed, or the poll is theirs.
create function public.post_poll(p_post_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'closes_at', pl.closes_at,
    'duration_hours', pl.duration_hours,
    'votes_count', pl.votes_count,
    'my_vote', v.option_id,
    'show_results', r.show,
    'options', (
      select jsonb_agg(jsonb_build_object(
        'id', o.id, 'label', o.label, 'votes_count', case when r.show then o.votes_count end
      ) order by o.position)
      from public.poll_options o where o.post_id = pl.post_id
    )
  )
  from public.polls pl
  join public.posts p on p.id = pl.post_id
  left join public.poll_votes v on v.post_id = pl.post_id and v.user_id = auth.uid()
  cross join lateral (
    select v.option_id is not null or pl.closes_at < now() or p.created_by = auth.uid() or public.can_act_as(p.author_id) as show
  ) r
  where pl.post_id = p_post_id and public.can_see_post(pl.post_id)
$$;

revoke select on public.poll_options from anon, authenticated;
grant select (id, post_id, position, label) on public.poll_options to anon, authenticated;

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
  case when p.deleted_at is null then public.post_poll(p.id) end as poll,
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
where not public.is_blocked_with_viewer(p.author_id)
  and not public.is_blocked_with_viewer(p.created_by);

-- ---------------------------------------------------------------------------
-- 5. Reporters stay anonymous
-- ---------------------------------------------------------------------------

revoke select on public.reports from authenticated;
grant select (id, target_type, target_id, target_profile_id, reason, details, snapshot, status, resolved_at, created_at)
  on public.reports to authenticated;

-- ---------------------------------------------------------------------------
-- 6. create_post checks what the server action checks
-- ---------------------------------------------------------------------------

create or replace function public.create_post(
  p_body text,
  p_language text default 'en',
  p_author_id uuid default null,
  p_parent_id uuid default null,
  p_quote_id uuid default null,
  p_space_id uuid default null,
  p_link_url text default null,
  p_link_preview jsonb default null,
  p_images jsonb default '[]'::jsonb,
  p_poll jsonb default null,
  p_event_id uuid default null,
  p_opportunity_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_author uuid := coalesce(p_author_id, auth.uid());
  v_body text := trim(coalesce(p_body, ''));
  v_images jsonb := coalesce(p_images, '[]'::jsonb);
  v_link text := nullif(trim(p_link_url), '');
  v_parent public.posts;
  v_quoted public.posts;
  v_id uuid;
  v_image jsonb;
  v_position integer := 0;
  v_options text[];
  v_mentioned uuid[];
begin
  if not public.is_active_member() then
    raise exception 'Your account cannot post right now' using errcode = '42501';
  end if;
  if not public.can_act_as(v_author) then
    raise exception 'You cannot post as this profile' using errcode = '42501';
  end if;
  if (select count(*) from public.posts where created_by = auth.uid() and created_at > now() - interval '1 minute') >= 10 then
    raise exception 'Slow down a little: you can post 10 times a minute' using errcode = '23514';
  end if;

  if char_length(v_body) > 4000 then
    raise exception 'Posts can be up to 4,000 characters' using errcode = '23514';
  end if;
  if jsonb_typeof(v_images) <> 'array' or jsonb_array_length(v_images) > 4 then
    raise exception 'Add up to 4 images' using errcode = '23514';
  end if;
  if char_length(v_body) < 1 and jsonb_array_length(v_images) = 0 and p_event_id is null and p_opportunity_id is null then
    raise exception 'Write something first' using errcode = '23514';
  end if;
  if p_poll is not null and (jsonb_array_length(v_images) > 0 or p_parent_id is not null) then
    raise exception 'Polls go on their own post, without images, and not in replies' using errcode = '23514';
  end if;
  -- A link card shows a link that is in the post, never one the reader can't
  -- see. The app links "www." addresses as https.
  if v_link is not null and strpos(v_body, v_link) = 0
     and not (v_link ~* '^https://www\.' and strpos(v_body, substr(v_link, 9)) > 0) then
    raise exception 'Only a link in the post can become its card' using errcode = '23514';
  end if;

  if p_parent_id is not null then
    select * into v_parent from public.posts where id = p_parent_id;
    if v_parent.id is null or not public.can_see_post(p_parent_id) then
      raise exception 'That post is no longer available' using errcode = 'P0002';
    end if;
    if public.is_blocked_between(v_author, v_parent.author_id) or public.is_blocked_between(v_author, v_parent.created_by) then
      raise exception 'You cannot reply to this post' using errcode = '42501';
    end if;
  end if;

  if p_quote_id is not null then
    select * into v_quoted from public.posts where id = p_quote_id;
    if v_quoted.id is null or v_quoted.status <> 'published' or not public.can_see_post(p_quote_id) then
      raise exception 'That post is no longer available' using errcode = 'P0002';
    end if;
    if public.is_blocked_between(v_author, v_quoted.author_id) or public.is_blocked_between(v_author, v_quoted.created_by) then
      raise exception 'You cannot quote this post' using errcode = '42501';
    end if;
  end if;

  if p_space_id is not null and p_parent_id is null and not exists (
    select 1 from public.space_members where space_id = p_space_id and user_id = auth.uid()
  ) then
    raise exception 'Join the space to post in it' using errcode = '42501';
  end if;
  if p_event_id is not null and not exists (
    select 1 from public.events where id = p_event_id and public.can_act_as(host_id)
  ) then
    raise exception 'You can only share events you host' using errcode = '42501';
  end if;
  if p_opportunity_id is not null and not exists (
    select 1 from public.opportunities where id = p_opportunity_id and public.can_act_as(poster_id)
  ) then
    raise exception 'You can only share opportunities you posted' using errcode = '42501';
  end if;

  select coalesce(array_agg(pr.id), '{}') into v_mentioned
  from public.profiles pr
  where pr.username = any (public.extract_mentions(v_body))
    and not public.is_blocked_between(pr.id, v_author)
    and not public.is_blocked_between(pr.id, auth.uid());

  insert into public.posts (
    author_id, created_by, body, language, parent_id, root_id, quote_id, space_id,
    event_id, opportunity_id, link_url, link_preview, topics, mentions
  ) values (
    v_author, auth.uid(), v_body, coalesce(nullif(lower(p_language), ''), 'en'),
    p_parent_id, coalesce(v_parent.root_id, v_parent.id), p_quote_id,
    coalesce(v_parent.space_id, p_space_id), p_event_id, p_opportunity_id,
    v_link, case when v_link is not null then p_link_preview end, public.extract_topics(v_body), v_mentioned
  )
  returning id into v_id;

  for v_image in select * from jsonb_array_elements(v_images) loop
    -- Uploads live in the uploader's own folder of the media bucket, and the
    -- image shown is the public address of that upload, on whatever host
    -- serves the project's storage.
    if coalesce(v_image ->> 'path', '') !~ ('^' || auth.uid()::text || '/[A-Za-z0-9_/-]+\.[a-z0-9]+$')
       or (v_image ->> 'url') is distinct from
          substring(v_image ->> 'url' from '^https?://[A-Za-z0-9.:-]+') || '/storage/v1/object/public/media/' || (v_image ->> 'path') then
      raise exception 'Invalid image' using errcode = '42501';
    end if;
    insert into public.post_images (post_id, storage_path, url, width, height, alt_text, position)
    values (
      v_id, v_image ->> 'path', v_image ->> 'url',
      nullif(v_image ->> 'width', '')::integer, nullif(v_image ->> 'height', '')::integer,
      left(trim(coalesce(v_image ->> 'alt', '')), 1000), v_position
    );
    v_position := v_position + 1;
  end loop;

  if p_poll is not null then
    select array_agg(distinct trim(o)) into v_options
    from jsonb_array_elements_text(p_poll -> 'options') as o where trim(o) <> '';
    if coalesce(array_length(v_options, 1), 0) not between 2 and 4
       or jsonb_array_length(p_poll -> 'options') <> array_length(v_options, 1) then
      raise exception 'Polls need 2 to 4 different options' using errcode = '23514';
    end if;
    insert into public.polls (post_id, duration_hours)
    values (v_id, coalesce((p_poll ->> 'duration_hours')::integer, 24));
    insert into public.poll_options (post_id, position, label)
    select v_id, o.ordinality - 1, trim(o.value)
    from jsonb_array_elements_text(p_poll -> 'options') with ordinality as o;
  end if;

  if public.has_good_reputation(auth.uid()) then
    perform public.publish_post(v_id);
  end if;

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. Profile links
-- ---------------------------------------------------------------------------

-- Not validated against existing rows: a profile with an old bad link is
-- asked to fix it the next time it is saved, rather than failing the deploy.
alter table public.profiles
  add constraint profiles_links_are_web check (
    not jsonb_path_exists(links, '$[*] ? (!(@.url.type() == "string" && @.url like_regex "^https?://"))')
  ) not valid;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

revoke all on function public.limit_message_requests() from public, anon, authenticated;
revoke all on function public.post_poll(uuid) from public;
-- post_details calls post_poll as the requesting role.
grant execute on function public.post_poll(uuid) to anon, authenticated;
