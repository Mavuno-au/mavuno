-- Work that happens after something is posted: fetching a link's card, and
-- the automatic check. The database decides what needs doing, so scheduled
-- posts and direct API calls get the same treatment as the app.
--
-- A trigger on posts, events and opportunities writes a row to
-- background_tasks. The app (straight after a post, and from /api/tasks)
-- claims due rows and does the work: three tries, the second a minute after
-- the first and the third ten minutes later, as a crashed worker's lease runs
-- out on the same schedule. Finished rows are deleted; failed ones are kept
-- for a week so the Health tab can show them.
--
-- Link cards are written by the server only. create_post and schedule_post no
-- longer take one from the caller, which let anyone with a session forge a
-- card's title, text and image for a real-looking link.

create table public.background_tasks (
  id bigint generated always as identity primary key,
  kind text not null check (kind in ('link_preview', 'automatic_check')),
  target_type public.report_target not null check (target_type in ('post', 'event', 'opportunity')),
  target_id uuid not null,
  attempts smallint not null default 0 check (attempts between 0 and 3),
  run_after timestamptz not null default now(),
  last_error text check (char_length(last_error) <= 500),
  failed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (kind, target_type, target_id)
);

create index background_tasks_due_idx on public.background_tasks (run_after) where failed_at is null;
create index background_tasks_target_idx on public.background_tasks (target_id) where failed_at is null;
create index background_tasks_failed_idx on public.background_tasks (failed_at) where failed_at is not null;

alter table public.background_tasks enable row level security;

-- What the automatic check flagged on an event or opportunity, as post_flags
-- does for posts.
create table public.listing_flags (
  id bigint generated always as identity primary key,
  event_id uuid unique references public.events (id) on delete cascade,
  opportunity_id uuid unique references public.opportunities (id) on delete cascade,
  categories text[] not null check (cardinality(categories) between 1 and 20),
  created_at timestamptz not null default now(),
  check (num_nonnulls(event_id, opportunity_id) = 1)
);

alter table public.listing_flags enable row level security;

create policy "Moderators see automatic flags on listings" on public.listing_flags for select to authenticated
  using ((select public.is_moderator()));

-- ---------------------------------------------------------------------------
-- Who is checked
-- ---------------------------------------------------------------------------

-- Everyone except moderators, until they have a track record: a member for a
-- week, with three things published before this one and nothing reported in
-- the last week (has_good_reputation). An hour and one post was too easy to
-- earn before posting freely.
create function public.needs_automatic_check(p_person uuid, p_before timestamptz)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_person is not null
    and not exists (select 1 from public.profile_settings s where s.id = p_person and s.site_role in ('moderator', 'admin'))
    and not (
      public.has_good_reputation(p_person)
      and exists (select 1 from public.profiles pr where pr.id = p_person and pr.created_at < now() - interval '7 days')
      and (
        (select count(*) from (
          select 1 from public.posts
          where created_by = p_person and status = 'published' and deleted_at is null and created_at < p_before
          limit 3
        ) as earlier)
        + (select count(*) from public.events where created_by = p_person and status = 'published' and created_at < p_before)
        + (select count(*) from public.opportunities where created_by = p_person and status = 'published' and created_at < p_before)
      ) >= 3
    )
$$;

create function public.queue_background_tasks()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_type public.report_target := case tg_table_name when 'posts' then 'post' when 'events' then 'event' else 'opportunity' end::public.report_target;
begin
  -- A quote post shows the quoted post, not a card.
  if tg_table_name = 'posts' then
    if new.link_url is not null and new.quote_id is null then
      insert into public.background_tasks (kind, target_type, target_id) values ('link_preview', v_type, new.id)
      on conflict do nothing;
    end if;
  end if;
  if public.needs_automatic_check(new.created_by, new.created_at) then
    insert into public.background_tasks (kind, target_type, target_id) values ('automatic_check', v_type, new.id)
    on conflict do nothing;
  end if;
  return null;
end;
$$;

create trigger posts_queue_background_tasks after insert on public.posts
  for each row execute function public.queue_background_tasks();
create trigger events_queue_background_tasks after insert on public.events
  for each row execute function public.queue_background_tasks();
create trigger opportunities_queue_background_tasks after insert on public.opportunities
  for each row execute function public.queue_background_tasks();

-- ---------------------------------------------------------------------------
-- Posting without a card from the caller
-- ---------------------------------------------------------------------------

drop function public.create_post(text, text, uuid, uuid, uuid, uuid, text, jsonb, jsonb, jsonb, uuid, uuid);

create function public.create_post(
  p_body text,
  p_language text default 'en',
  p_author_id uuid default null,
  p_parent_id uuid default null,
  p_quote_id uuid default null,
  p_space_id uuid default null,
  p_link_url text default null,
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
  v_repeated boolean;
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

  -- Twice is fine (a correction, a cross-post); a third copy within the hour
  -- waits for a moderator. Short replies such as "Congratulations!" repeat
  -- naturally, so only posts of 20 characters or more count.
  v_repeated := char_length(v_body) >= 20 and (
    select count(*) from public.posts
    where created_by = auth.uid() and created_at > now() - interval '1 hour'
      and lower(regexp_replace(body, '\s+', ' ', 'g')) = lower(regexp_replace(v_body, '\s+', ' ', 'g'))
  ) >= 2;

  select coalesce(array_agg(pr.id), '{}') into v_mentioned
  from public.profiles pr
  where pr.username = any (public.extract_mentions(v_body))
    and not public.is_blocked_between(pr.id, v_author)
    and not public.is_blocked_between(pr.id, auth.uid());

  insert into public.posts (
    author_id, created_by, body, language, parent_id, root_id, quote_id, space_id,
    event_id, opportunity_id, link_url, topics, mentions, moderation_note
  ) values (
    v_author, auth.uid(), v_body, coalesce(nullif(lower(p_language), ''), 'en'),
    p_parent_id, coalesce(v_parent.root_id, v_parent.id), p_quote_id,
    coalesce(v_parent.space_id, p_space_id), p_event_id, p_opportunity_id,
    v_link, public.extract_topics(v_body), v_mentioned,
    case when v_repeated then 'Held for review: posted several times in an hour' end
  )
  returning id into v_id;

  for v_image in select * from jsonb_array_elements(v_images) loop
    -- Uploads live in the uploader's own folder of the media bucket, as the
    -- WebP the server wrote, and the image shown is the public address of
    -- that upload, on whatever host serves the project's storage.
    if coalesce(v_image ->> 'path', '') !~ ('^' || auth.uid()::text || '/[A-Za-z0-9_/-]+\.webp$')
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

  if not v_repeated and public.has_good_reputation(auth.uid()) then
    perform public.publish_post(v_id);
  end if;

  return v_id;
end;
$$;


-- A scheduled post's card is fetched when it goes out, not up to 30 days
-- before.
drop function public.schedule_post(timestamptz, text, text, uuid, uuid, text, jsonb, jsonb, jsonb);
alter table public.scheduled_posts drop column link_preview;

create function public.schedule_post(
  p_scheduled_at timestamptz,
  p_body text,
  p_language text default 'en',
  p_author_id uuid default null,
  p_space_id uuid default null,
  p_link_url text default null,
  p_images jsonb default '[]'::jsonb,
  p_poll jsonb default null
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
  v_image jsonb;
  v_id uuid;
begin
  if not public.is_active_member() then
    raise exception 'Your account cannot post right now' using errcode = '42501';
  end if;
  if not public.can_act_as(v_author) then
    raise exception 'You cannot post as this profile' using errcode = '42501';
  end if;
  if p_scheduled_at is null or p_scheduled_at <= now() then
    raise exception 'Choose a time in the future' using errcode = '23514';
  end if;
  if p_scheduled_at > now() + interval '30 days' then
    raise exception 'You can schedule a post up to 30 days ahead' using errcode = '23514';
  end if;

  if char_length(v_body) > 4000 then
    raise exception 'Posts can be up to 4,000 characters' using errcode = '23514';
  end if;
  if jsonb_typeof(v_images) <> 'array' or jsonb_array_length(v_images) > 4 then
    raise exception 'Add up to 4 images' using errcode = '23514';
  end if;
  if char_length(v_body) < 1 and jsonb_array_length(v_images) = 0 then
    raise exception 'Write something first' using errcode = '23514';
  end if;
  if p_poll is not null and jsonb_array_length(v_images) > 0 then
    raise exception 'Polls go on their own post, without images, and not in replies' using errcode = '23514';
  end if;
  -- Cancelling queues these paths for removal, so they must be the member's own.
  for v_image in select * from jsonb_array_elements(v_images) loop
    if coalesce(v_image ->> 'path', '') !~ ('^' || auth.uid()::text || '/[A-Za-z0-9_/-]+\.[a-z0-9]+$') then
      raise exception 'Invalid image' using errcode = '42501';
    end if;
  end loop;

  -- Two requests at once must not both pass the limit.
  perform pg_advisory_xact_lock(hashtextextended('scheduled_posts:' || auth.uid()::text, 0));
  if (select count(*) from public.scheduled_posts where created_by = auth.uid() and submitted_at is null) >= 10 then
    raise exception 'You can have up to 10 scheduled posts. Cancel one before scheduling another.' using errcode = '23514';
  end if;

  insert into public.scheduled_posts (
    created_by, author_id, body, language, space_id, link_url, images, poll, scheduled_at
  ) values (
    auth.uid(), v_author, v_body, coalesce(nullif(lower(p_language), ''), 'en'), p_space_id,
    v_link, v_images, p_poll, p_scheduled_at
  )
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.publish_scheduled_posts()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sub text := current_setting('request.jwt.claim.sub', true);
  v_claims text := current_setting('request.jwt.claims', true);
  v_item public.scheduled_posts;
  v_post uuid;
  v_count integer := 0;
begin
  for v_item in
    select * from public.scheduled_posts
    where submitted_at is null and scheduled_at <= now()
    order by scheduled_at, id
    limit 100
    for update skip locked
  loop
    -- auth.uid() reads these, so create_post checks and records this member.
    perform set_config('request.jwt.claim.sub', v_item.created_by::text, true);
    perform set_config('request.jwt.claims', jsonb_build_object('sub', v_item.created_by, 'role', 'authenticated')::text, true);
    begin
      v_post := public.create_post(
        p_body => v_item.body,
        p_language => v_item.language,
        p_author_id => v_item.author_id,
        p_space_id => v_item.space_id,
        p_link_url => v_item.link_url,
        p_images => v_item.images,
        p_poll => v_item.poll
      );
      update public.scheduled_posts
      set submitted_at = now(), post_id = v_post, body = '', link_url = null, images = '[]'::jsonb, poll = null
      where id = v_item.id;
      v_count := v_count + 1;
    exception when others then
      update public.scheduled_posts
      set submitted_at = now(), error = sqlerrm, error_code = sqlstate, images = '[]'::jsonb
      where id = v_item.id;
      perform public.release_scheduled_images(v_item.images);
    end;
  end loop;

  perform set_config('request.jwt.claim.sub', coalesce(v_sub, ''), true);
  perform set_config('request.jwt.claims', coalesce(v_claims, ''), true);

  delete from public.scheduled_posts where submitted_at < now() - interval '30 days';
  return v_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- Running tasks (service role only)
-- ---------------------------------------------------------------------------

-- Hands out due tasks, optionally only one post's or listing's. Claiming
-- counts as an attempt and pushes the next try out, so a worker that dies
-- mid-task is retried on the same schedule as one that fails. Tasks that have
-- used all three tries are given up, and failures over a week old forgotten.
create function public.claim_background_tasks(p_limit integer default 10, p_target_id uuid default null)
returns table (id bigint, kind text, target_type public.report_target, target_id uuid, attempts smallint)
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.background_tasks t
  set failed_at = now(), last_error = coalesce(t.last_error, 'Did not finish')
  where t.failed_at is null and t.attempts >= 3 and t.run_after <= now();
  delete from public.background_tasks t where t.failed_at < now() - interval '7 days';

  return query
  with due as (
    select t.id from public.background_tasks t
    where t.failed_at is null and t.run_after <= now() and t.attempts < 3
      and (p_target_id is null or t.target_id = p_target_id)
    order by t.run_after, t.id
    limit least(greatest(coalesce(p_limit, 10), 1), 100)
    for update skip locked
  )
  update public.background_tasks t
  set attempts = t.attempts + 1,
      run_after = now() + case when t.attempts = 0 then interval '1 minute' else interval '10 minutes' end
  from due
  where t.id = due.id
  returning t.id, t.kind, t.target_type, t.target_id, t.attempts;
end;
$$;

-- Done (no error) deletes the task. An error is retried while tries are left
-- and p_retry says it could succeed later; otherwise the task is given up.
create function public.finish_background_task(p_id bigint, p_error text default null, p_retry boolean default false)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_error is null then
    delete from public.background_tasks where id = p_id;
    return;
  end if;
  update public.background_tasks
  set last_error = left(p_error, 500),
      failed_at = case when p_retry and attempts < 3 then null else now() end
  where id = p_id;
end;
$$;

-- Stores the card the server fetched for a post's link. It only lands on the
-- post while that link is still its link.
create function public.set_link_preview(p_post_id uuid, p_url text, p_preview jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text := p_preview ->> 'url';
  v_title text := nullif(trim(p_preview ->> 'title'), '');
  v_description text := nullif(trim(p_preview ->> 'description'), '');
  v_image text := nullif(p_preview ->> 'image', '');
  v_site text := nullif(trim(p_preview ->> 'site_name'), '');
begin
  if jsonb_typeof(p_preview) is distinct from 'object'
     or coalesce(v_url, '') !~ '^https?://' or char_length(v_url) > 2000
     or v_title is null or char_length(v_title) > 300
     or char_length(v_description) > 500
     or (v_image is not null and (v_image !~ '^https://' or char_length(v_image) > 2000))
     or char_length(v_site) > 100 then
    raise exception 'Invalid link preview' using errcode = '22023';
  end if;

  update public.posts
  set link_preview = jsonb_build_object('url', v_url, 'title', v_title, 'description', v_description, 'image', v_image, 'site_name', v_site)
  where id = p_post_id and link_url = p_url and deleted_at is null;
end;
$$;

-- ---------------------------------------------------------------------------
-- The automatic check for posts, events and opportunities
-- ---------------------------------------------------------------------------

drop function public.automatic_check_subject(uuid);
drop function public.automatic_hold(uuid, text[]);

-- What the check reads, or null when there is nothing left to check: it is
-- gone, rejected or already flagged. Whether it needs a check at all was
-- decided when it was created (needs_automatic_check).
create function public.automatic_check_subject(p_target_type public.report_target, p_target_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case p_target_type
    when 'post' then (
      select jsonb_build_object(
        'text', concat_ws(E'\n', nullif(p.body, ''), (
          select string_agg(o.label, E'\n' order by o.position) from public.poll_options o where o.post_id = p.id
        )),
        'images', (
          select coalesce(jsonb_agg(i.url order by i.position), '[]'::jsonb) from public.post_images i where i.post_id = p.id
        )
      )
      from public.posts p
      where p.id = p_target_id and p.deleted_at is null and p.status <> 'rejected'
        and not exists (select 1 from public.post_flags f where f.post_id = p.id)
    )
    when 'event' then (
      select jsonb_build_object(
        'text', concat_ws(E'\n', e.title, nullif(e.description, ''), e.venue_name, e.address),
        'images', case when e.cover_url ~ '^https://' then jsonb_build_array(e.cover_url) else '[]'::jsonb end
      )
      from public.events e
      where e.id = p_target_id and e.status <> 'rejected'
        and not exists (select 1 from public.listing_flags f where f.event_id = e.id)
    )
    when 'opportunity' then (
      select jsonb_build_object(
        'text', concat_ws(E'\n', o.title, o.organisation_name, o.description, o.compensation, o.location_text),
        'images', '[]'::jsonb
      )
      from public.opportunities o
      where o.id = p_target_id and o.status <> 'rejected'
        and not exists (select 1 from public.listing_flags f where f.opportunity_id = o.id)
    )
  end
$$;

-- Takes what the check flagged back to review, with the categories for
-- moderators. It never rejects: a person decides.
create function public.automatic_hold(p_target_type public.report_target, p_target_id uuid, p_categories text[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_post public.posts;
begin
  if coalesce(cardinality(p_categories), 0) not between 1 and 20
     or exists (select 1 from unnest(p_categories) as c where c !~ '^[a-z][a-z/_-]{0,39}$') then
    raise exception 'Invalid categories' using errcode = '22023';
  end if;

  case p_target_type
    when 'post' then
      select * into v_post from public.posts
      where id = p_target_id and deleted_at is null and status <> 'rejected' for update;
      if v_post.id is null then
        return;
      end if;
      insert into public.post_flags (post_id, categories) values (p_target_id, p_categories)
      on conflict (post_id) do update set categories = excluded.categories, created_at = now();
      if v_post.status = 'published' then
        update public.posts set status = 'pending', moderation_note = 'Held for review after an automatic check'
        where id = p_target_id;
        perform public.count_post(v_post, -1);
      end if;
    when 'event' then
      perform 1 from public.events where id = p_target_id and status <> 'rejected' for update;
      if not found then
        return;
      end if;
      insert into public.listing_flags (event_id, categories) values (p_target_id, p_categories)
      on conflict (event_id) do update set categories = excluded.categories, created_at = now();
      update public.events set status = 'pending' where id = p_target_id and status = 'published';
    when 'opportunity' then
      perform 1 from public.opportunities where id = p_target_id and status <> 'rejected' for update;
      if not found then
        return;
      end if;
      insert into public.listing_flags (opportunity_id, categories) values (p_target_id, p_categories)
      on conflict (opportunity_id) do update set categories = excluded.categories, created_at = now();
      update public.opportunities set status = 'pending' where id = p_target_id and status = 'published';
    else
      raise exception 'Only posts, events and opportunities are checked' using errcode = '22023';
  end case;
end;
$$;

-- The review queue shows what the check flagged on listings too.
create or replace view public.review_queue
with (security_invoker = true)
as
select 'post'::public.report_target as target_type, p.id as target_id, p.author_id as profile_id, p.created_by,
  p.body as content, p.language, p.moderation_note as note, p.parent_id, p.created_at,
  (select f.categories from public.post_flags f where f.post_id = p.id) as flags
from public.posts p
where p.status = 'pending' and p.deleted_at is null and public.is_moderator()
union all
select 'event', e.id, e.host_id, e.created_by, e.title || E'\n\n' || e.description, 'en', null, null, e.created_at,
  (select f.categories from public.listing_flags f where f.event_id = e.id)
from public.events e where e.status = 'pending' and public.is_moderator()
union all
select 'opportunity', o.id, o.poster_id, o.created_by, o.title || E'\n\n' || o.description, 'en', null, null, o.created_at,
  (select f.categories from public.listing_flags f where f.opportunity_id = o.id)
from public.opportunities o where o.status = 'pending' and public.is_moderator();

-- ---------------------------------------------------------------------------
-- Cards of Mavuno's own pages
-- ---------------------------------------------------------------------------

-- A card of a post or profile here copied its text into someone else's post,
-- where it outlived the post or account it came from. The app no longer
-- fetches cards for its own pages; these are the ones made before.
update public.posts set link_preview = null
where link_preview is not null and link_url ~* '^https?://(www\.)?mavuno\.au([/?#:]|$)';
update public.deleted_post_contents set link_preview = null
where link_preview is not null and link_url ~* '^https?://(www\.)?mavuno\.au([/?#:]|$)';

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

revoke all on table public.background_tasks from public, anon, authenticated;
grant all on table public.background_tasks to service_role;

revoke all on table public.listing_flags from public, anon, authenticated;
grant select on table public.listing_flags to authenticated;
grant all on table public.listing_flags to service_role;

revoke all on function
  public.needs_automatic_check(uuid, timestamptz),
  public.queue_background_tasks(),
  public.create_post(text, text, uuid, uuid, uuid, uuid, text, jsonb, jsonb, uuid, uuid),
  public.schedule_post(timestamptz, text, text, uuid, uuid, text, jsonb, jsonb),
  public.claim_background_tasks(integer, uuid),
  public.finish_background_task(bigint, text, boolean),
  public.set_link_preview(uuid, text, jsonb),
  public.automatic_check_subject(public.report_target, uuid),
  public.automatic_hold(public.report_target, uuid, text[])
from public, anon, authenticated;

grant execute on function
  public.create_post(text, text, uuid, uuid, uuid, uuid, text, jsonb, jsonb, uuid, uuid),
  public.schedule_post(timestamptz, text, text, uuid, uuid, text, jsonb, jsonb)
to authenticated;

grant execute on function
  public.claim_background_tasks(integer, uuid),
  public.finish_background_task(bigint, text, boolean),
  public.set_link_preview(uuid, text, jsonb),
  public.automatic_check_subject(public.report_target, uuid),
  public.automatic_hold(public.report_target, uuid, text[])
to service_role;
