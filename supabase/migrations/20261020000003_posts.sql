-- Posts, replies, quote posts, images, polls, likes, saved posts, translations
-- and notifications.
--
-- Lifecycle of a post:
--   * create_post inserts it as 'pending'. Authors with a good reputation are
--     published at once; everyone else waits for a moderator.
--   * publish_post makes it public, counts it, opens its poll and releases its
--     reply, quote and mention notifications (once).
--   * delete_post tombstones it straight away and keeps its content privately
--     for 30 seconds so restore_post can undo; purge_deleted_posts then erases it.
--   * Posts are never edited.

create type public.notification_type as enum (
  'follow', 'like', 'reply', 'quote', 'mention', 'event_rsvp', 'org_added', 'moderation'
);

create table public.posts (
  id uuid primary key default gen_random_uuid(),
  -- The profile the post appears under (a person or an organisation).
  author_id uuid references public.profiles (id) on delete set null,
  -- The person who wrote it.
  created_by uuid references public.profiles (id) on delete set null,
  status public.content_status not null default 'pending',
  body text not null default '' check (char_length(body) <= 4000),
  language text not null default 'en' check (language ~ '^[a-z]{2,3}$'),
  parent_id uuid references public.posts (id) on delete set null,
  root_id uuid references public.posts (id) on delete set null,
  quote_id uuid references public.posts (id) on delete set null,
  space_id uuid references public.spaces (id) on delete set null,
  event_id uuid references public.events (id) on delete set null,
  opportunity_id uuid references public.opportunities (id) on delete set null,
  link_url text check (link_url ~ '^https?://' and char_length(link_url) <= 2000),
  link_preview jsonb check (link_preview is null or jsonb_typeof(link_preview) = 'object'),
  topics text[] not null default '{}',
  mentions uuid[] not null default '{}',
  moderation_note text check (char_length(moderation_note) <= 280),
  reply_count integer not null default 0,
  like_count integer not null default 0,
  quote_count integer not null default 0,
  hot_score double precision not null default 0,
  published_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  check (parent_id is null or quote_id is null)
);

create index posts_latest_idx on public.posts (created_at desc)
  where parent_id is null and deleted_at is null and status = 'published';
create index posts_author_idx on public.posts (author_id, created_at desc);
create index posts_created_by_idx on public.posts (created_by, created_at desc);
create index posts_parent_idx on public.posts (parent_id, created_at);
create index posts_root_idx on public.posts (root_id);
create index posts_quote_idx on public.posts (quote_id);
create index posts_space_idx on public.posts (space_id, created_at desc) where space_id is not null;
create index posts_hot_idx on public.posts (hot_score desc) where parent_id is null and deleted_at is null and status = 'published';
create index posts_pending_idx on public.posts (created_at) where status = 'pending' and deleted_at is null;
create index posts_topics_idx on public.posts using gin (topics);
create index posts_fts_idx on public.posts using gin (to_tsvector('simple', body));

alter table public.profiles
  add constraint profiles_pinned_post_fk foreign key (pinned_post_id) references public.posts (id) on delete set null;

-- The content of a just-deleted post, kept only for the undo window.
create table public.deleted_post_contents (
  post_id uuid primary key references public.posts (id) on delete cascade,
  body text not null,
  link_url text,
  link_preview jsonb,
  topics text[] not null,
  mentions uuid[] not null,
  event_id uuid,
  opportunity_id uuid,
  deleted_by uuid not null,
  deleted_at timestamptz not null default now()
);

-- Storage files that belonged to erased content, removed by the maintenance job.
create table public.storage_cleanup (
  bucket text not null,
  path text not null,
  created_at timestamptz not null default now(),
  primary key (bucket, path)
);

create table public.post_images (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts (id) on delete cascade,
  storage_path text not null,
  url text not null check (url ~ '^https?://'),
  width integer check (width > 0),
  height integer check (height > 0),
  alt_text text not null default '' check (char_length(alt_text) <= 1000),
  position smallint not null default 0 check (position between 0 and 3)
);

create index post_images_post_idx on public.post_images (post_id, position);

create table public.polls (
  post_id uuid primary key references public.posts (id) on delete cascade,
  duration_hours integer not null check (duration_hours in (1, 24, 72, 168)),
  -- Set when the post is published: time spent pending does not use up voting.
  closes_at timestamptz,
  votes_count integer not null default 0
);

create table public.poll_options (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.polls (post_id) on delete cascade,
  position smallint not null check (position between 0 and 3),
  label text not null check (char_length(label) between 1 and 50),
  votes_count integer not null default 0,
  unique (post_id, position)
);

-- One vote per person per poll. Votes cannot be changed or withdrawn.
create table public.poll_votes (
  post_id uuid not null references public.polls (post_id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  option_id uuid not null references public.poll_options (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create table public.likes (
  user_id uuid not null references public.profiles (id) on delete cascade,
  post_id uuid not null references public.posts (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, post_id)
);

create index likes_post_idx on public.likes (post_id);

create table public.saves (
  user_id uuid not null references public.profiles (id) on delete cascade,
  post_id uuid not null references public.posts (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, post_id)
);

create index saves_user_idx on public.saves (user_id, created_at desc);

-- Cached translations, written by the server, expiring after seven days.
create table public.post_translations (
  post_id uuid not null references public.posts (id) on delete cascade,
  target_language text not null check (target_language ~ '^[a-z]{2,3}$'),
  body text not null,
  created_at timestamptz not null default now(),
  primary key (post_id, target_language)
);

create table public.notifications (
  id bigint generated always as identity primary key,
  recipient_id uuid not null references public.profiles (id) on delete cascade,
  actor_id uuid references public.profiles (id) on delete cascade,
  type public.notification_type not null,
  post_id uuid references public.posts (id) on delete cascade,
  event_id uuid references public.events (id) on delete cascade,
  message text check (char_length(message) <= 500),
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index notifications_recipient_idx on public.notifications (recipient_id, created_at desc);
create index notifications_unread_idx on public.notifications (recipient_id) where read_at is null;
create index notifications_post_idx on public.notifications (post_id);

alter table public.posts enable row level security;
alter table public.deleted_post_contents enable row level security;
alter table public.storage_cleanup enable row level security;
alter table public.post_images enable row level security;
alter table public.polls enable row level security;
alter table public.poll_options enable row level security;
alter table public.poll_votes enable row level security;
alter table public.likes enable row level security;
alter table public.saves enable row level security;
alter table public.post_translations enable row level security;
alter table public.notifications enable row level security;

-- ---------------------------------------------------------------------------
-- Visibility
-- ---------------------------------------------------------------------------

-- The viewer may see the post: published, or theirs (also pending and rejected
-- ones), or they moderate. Deleted posts remain as rows (tombstones) so threads
-- stay intact, but their content is gone.
create function public.can_see_post(p_post_id uuid)
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
  )
$$;

create policy "Published posts are public" on public.posts for select
  using (status = 'published' or created_by = auth.uid() or public.can_act_as(author_id) or public.is_moderator());

create policy "Images follow their post" on public.post_images for select using (public.can_see_post(post_id));
create policy "Polls follow their post" on public.polls for select using (public.can_see_post(post_id));
create policy "Poll options follow their post" on public.poll_options for select using (public.can_see_post(post_id));
create policy "People see their own votes" on public.poll_votes for select to authenticated using (user_id = auth.uid());

create policy "Likes are public" on public.likes for select using (true);
create policy "People like others' posts" on public.likes for insert to authenticated
  with check (
    user_id = auth.uid() and public.is_active_member() and public.can_see_post(post_id)
    and not exists (select 1 from public.posts p where p.id = post_id and public.can_act_as(p.author_id))
  );
create policy "People unlike" on public.likes for delete to authenticated using (user_id = auth.uid());

create policy "Saved posts are private" on public.saves for select to authenticated using (user_id = auth.uid());
create policy "People save posts they can see" on public.saves for insert to authenticated
  with check (user_id = auth.uid() and public.can_see_post(post_id));
create policy "People unsave" on public.saves for delete to authenticated using (user_id = auth.uid());

create policy "Fresh translations follow their post" on public.post_translations for select
  using (created_at > now() - interval '7 days' and public.can_see_post(post_id));

create policy "People read notifications of profiles they act as" on public.notifications for select to authenticated
  using (public.can_act_as(recipient_id));
grant update (read_at) on public.notifications to authenticated;
create policy "People mark notifications read" on public.notifications for update to authenticated
  using (public.can_act_as(recipient_id)) with check (public.can_act_as(recipient_id));

revoke insert, update, delete on public.posts, public.deleted_post_contents, public.storage_cleanup,
  public.post_images, public.polls, public.poll_options, public.poll_votes, public.post_translations
  from anon, authenticated;
revoke select on public.deleted_post_contents, public.storage_cleanup from anon, authenticated;
revoke insert, delete on public.notifications from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Reputation
-- ---------------------------------------------------------------------------

-- A person's posts and listings skip review when they moderate, or when
-- premoderation is on and they have been a member for an hour, have had
-- something approved before, and nothing of theirs was reported in the last
-- seven days without being dismissed.
create function public.has_good_reputation(p_person uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.profile_settings where id = p_person and site_role in ('moderator', 'admin')) then
    return true;
  end if;

  if exists (
    select 1 from public.reports r
    where r.status <> 'dismissed' and r.created_at > now() - interval '7 days'
      and (r.target_profile_id = p_person or r.target_profile_id in (
        select org_id from public.organisation_members where user_id = p_person
      ))
  ) then
    return false;
  end if;

  if not (select premoderation from public.site_settings) then
    return true;
  end if;

  return exists (select 1 from public.profiles where id = p_person and created_at < now() - interval '1 hour')
    and (
      exists (select 1 from public.posts where created_by = p_person and published_at is not null)
      or exists (select 1 from public.events where created_by = p_person and status = 'published')
      or exists (select 1 from public.opportunities where created_by = p_person and status = 'published')
    );
end;
$$;

-- ---------------------------------------------------------------------------
-- Trending: distinct people engaging with a thread, a reply or quote worth
-- three likes, each person once, the author excluded. Engagement has to double
-- to keep up with a post three hours newer.
-- ---------------------------------------------------------------------------

create function public.refresh_hot_score(p_post_id uuid)
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
          select r.created_by, 3 from public.posts r
          where (r.root_id = p.id or r.quote_id = p.id) and r.status = 'published' and r.deleted_at is null
        ) e
        where person is distinct from p.created_by
        group by person
      ) w
    ), 0)) / ln(2) + extract(epoch from coalesce(p.published_at, p.created_at)) / 10800.0
  where p.id = p_post_id
$$;

-- ---------------------------------------------------------------------------
-- Notifications
-- ---------------------------------------------------------------------------

-- Skips self-notifications, recipients who blocked or muted the actor, and a
-- second notification for the same like, follow or RSVP.
create function public.notify(
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

create function public.notify_follow()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.notify(new.followee_id, new.follower_id, 'follow');
  return new;
end;
$$;

create trigger follows_notify after insert on public.follows
  for each row execute function public.notify_follow();

create function public.handle_like()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_post public.posts;
begin
  if tg_op = 'INSERT' then
    update public.posts set like_count = like_count + 1 where id = new.post_id returning * into v_post;
    perform public.notify(v_post.author_id, new.user_id, 'like', new.post_id);
  else
    update public.posts set like_count = greatest(like_count - 1, 0) where id = old.post_id returning * into v_post;
    -- An unlike takes its notification with it.
    delete from public.notifications where type = 'like' and post_id = old.post_id and actor_id = old.user_id;
  end if;
  perform public.refresh_hot_score(coalesce(v_post.root_id, v_post.id));
  return coalesce(new, old);
end;
$$;

create trigger likes_handle after insert or delete on public.likes
  for each row execute function public.handle_like();

create function public.notify_event_rsvp()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'going' and (tg_op = 'INSERT' or old.status <> 'going') then
    perform public.notify((select host_id from public.events where id = new.event_id), new.user_id, 'event_rsvp', null, new.event_id);
  end if;
  return new;
end;
$$;

create trigger event_rsvps_notify after insert or update on public.event_rsvps
  for each row execute function public.notify_event_rsvp();

create function public.notify_org_member()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is distinct from new.user_id then
    perform public.notify(new.user_id, new.org_id, 'org_added');
  end if;
  return new;
end;
$$;

create trigger organisation_members_notify after insert on public.organisation_members
  for each row execute function public.notify_org_member();

-- ---------------------------------------------------------------------------
-- Text parsing
-- ---------------------------------------------------------------------------

create function public.extract_topics(p_body text)
returns text[]
language sql
immutable
set search_path = ''
as $$
  select coalesce(array_agg(distinct lower(m[2])), '{}')
  from regexp_matches(coalesce(p_body, ''), '(^|[^A-Za-z0-9_&/])#([A-Za-z][A-Za-z0-9_]{1,39})', 'g') as m
$$;

-- @username, but not email addresses or scoped package names.
create function public.extract_mentions(p_body text)
returns text[]
language sql
immutable
set search_path = ''
as $$
  select coalesce(array_agg(distinct lower(m[2])), '{}')
  from regexp_matches(coalesce(p_body, ''), '(^|[^A-Za-z0-9_.@/])@([A-Za-z0-9_]{3,30})(?![A-Za-z0-9_/.-]*[A-Za-z0-9])', 'g') as m
$$;

-- ---------------------------------------------------------------------------
-- Publishing
-- ---------------------------------------------------------------------------

-- Adds (p_delta = 1) or removes (-1) a published post from the counters.
create function public.count_post(p_post public.posts, p_delta integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_post.parent_id is null then
    update public.profiles set posts_count = greatest(posts_count + p_delta, 0) where id = p_post.author_id;
    if p_post.space_id is not null then
      update public.spaces set posts_count = greatest(posts_count + p_delta, 0),
        last_post_at = case when p_delta > 0 then greatest(last_post_at, p_post.created_at) else last_post_at end
      where id = p_post.space_id;
    end if;
  else
    update public.posts set reply_count = greatest(reply_count + p_delta, 0) where id = p_post.parent_id;
  end if;
  if p_post.quote_id is not null then
    update public.posts set quote_count = greatest(quote_count + p_delta, 0) where id = p_post.quote_id;
  end if;
  perform public.refresh_hot_score(coalesce(p_post.root_id, p_post.quote_id, p_post.id));
  if p_post.quote_id is not null then
    perform public.refresh_hot_score(p_post.quote_id);
  end if;
end;
$$;

create function public.publish_post(p_post_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_post public.posts;
  v_parent_author uuid;
  v_quoted_author uuid;
  v_mentioned uuid;
  v_first boolean;
begin
  select * into v_post from public.posts where id = p_post_id for update;
  if v_post.id is null or v_post.status = 'published' or v_post.deleted_at is not null then
    return;
  end if;
  v_first := v_post.published_at is null;

  update public.posts set status = 'published', moderation_note = null,
    published_at = coalesce(published_at, now())
  where id = p_post_id returning * into v_post;

  perform public.count_post(v_post, 1);
  perform public.refresh_hot_score(p_post_id);

  -- First publication only: open the poll and notify.
  if not v_first then
    return;
  end if;

  update public.polls set closes_at = now() + make_interval(hours => duration_hours) where post_id = p_post_id;

  select author_id into v_parent_author from public.posts where id = v_post.parent_id;
  select author_id into v_quoted_author from public.posts where id = v_post.quote_id;
  perform public.notify(v_parent_author, v_post.author_id, 'reply', p_post_id);
  perform public.notify(v_quoted_author, v_post.author_id, 'quote', p_post_id);

  foreach v_mentioned in array v_post.mentions loop
    if v_mentioned is distinct from v_parent_author and v_mentioned is distinct from v_quoted_author then
      perform public.notify(v_mentioned, v_post.author_id, 'mention', p_post_id);
    end if;
  end loop;
end;
$$;

revoke execute on function public.publish_post, public.count_post, public.notify, public.refresh_hot_score
  from anon, authenticated;

-- Creates a post, reply or quote post.
--   p_images: [{"path": "<uid>/posts/x.webp", "url": "https://…", "width": 1, "height": 1, "alt": "…"}]
--   p_poll:   {"options": ["Yes", "No"], "duration_hours": 24}
create function public.create_post(
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

  if p_parent_id is not null then
    select * into v_parent from public.posts where id = p_parent_id;
    if v_parent.id is null or not public.can_see_post(p_parent_id) then
      raise exception 'That post is no longer available' using errcode = 'P0002';
    end if;
    if public.is_blocked_between(v_author, v_parent.author_id) then
      raise exception 'You cannot reply to this post' using errcode = '42501';
    end if;
  end if;

  if p_quote_id is not null then
    select * into v_quoted from public.posts where id = p_quote_id;
    if v_quoted.id is null or v_quoted.status <> 'published' or not public.can_see_post(p_quote_id) then
      raise exception 'That post is no longer available' using errcode = 'P0002';
    end if;
    if public.is_blocked_between(v_author, v_quoted.author_id) then
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
    and not public.is_blocked_between(pr.id, v_author);

  insert into public.posts (
    author_id, created_by, body, language, parent_id, root_id, quote_id, space_id,
    event_id, opportunity_id, link_url, link_preview, topics, mentions
  ) values (
    v_author, auth.uid(), v_body, coalesce(nullif(lower(p_language), ''), 'en'),
    p_parent_id, coalesce(v_parent.root_id, v_parent.id), p_quote_id,
    coalesce(v_parent.space_id, p_space_id), p_event_id, p_opportunity_id,
    nullif(trim(p_link_url), ''), p_link_preview, public.extract_topics(v_body), v_mentioned
  )
  returning id into v_id;

  for v_image in select * from jsonb_array_elements(v_images) loop
    -- Uploads live in the uploader's own folder of the media bucket.
    if split_part(v_image ->> 'path', '/', 1) <> auth.uid()::text then
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
-- Deleting, undo and purging
-- ---------------------------------------------------------------------------

create function public.delete_post(p_post_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_post public.posts;
begin
  select * into v_post from public.posts where id = p_post_id for update;
  if v_post.id is null or v_post.deleted_at is not null then
    return;
  end if;
  if not (v_post.created_by = auth.uid() or public.can_act_as(v_post.author_id)) then
    raise exception 'You cannot delete this post' using errcode = '42501';
  end if;

  insert into public.deleted_post_contents (post_id, body, link_url, link_preview, topics, mentions, event_id, opportunity_id, deleted_by)
  values (v_post.id, v_post.body, v_post.link_url, v_post.link_preview, v_post.topics, v_post.mentions, v_post.event_id, v_post.opportunity_id, auth.uid());

  update public.posts set deleted_at = now(), body = '', link_url = null, link_preview = null,
    topics = '{}', mentions = '{}', event_id = null, opportunity_id = null
  where id = p_post_id;

  if v_post.status = 'published' then
    perform public.count_post(v_post, -1);
  end if;
  update public.profiles set pinned_post_id = null where pinned_post_id = p_post_id;
end;
$$;

-- Undoes a deletion within 30 seconds. Notifications are not sent again.
create function public.restore_post(p_post_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_saved public.deleted_post_contents;
  v_post public.posts;
begin
  select * into v_saved from public.deleted_post_contents
  where post_id = p_post_id and deleted_by = auth.uid() and deleted_at > now() - interval '30 seconds';
  if v_saved.post_id is null then
    raise exception 'It is too late to undo this' using errcode = 'P0002';
  end if;

  update public.posts set deleted_at = null, body = v_saved.body, link_url = v_saved.link_url,
    link_preview = v_saved.link_preview, topics = v_saved.topics, mentions = v_saved.mentions,
    event_id = v_saved.event_id, opportunity_id = v_saved.opportunity_id
  where id = p_post_id returning * into v_post;
  delete from public.deleted_post_contents where post_id = p_post_id;

  if v_post.status = 'published' then
    perform public.count_post(v_post, 1);
  end if;
end;
$$;

-- Erases everything about one deleted post except the tombstone row.
create function public.erase_post(p_post_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.storage_cleanup (bucket, path)
  select 'media', storage_path from public.post_images where post_id = p_post_id
  on conflict do nothing;

  delete from public.deleted_post_contents where post_id = p_post_id;
  delete from public.post_images where post_id = p_post_id;
  delete from public.polls where post_id = p_post_id;
  delete from public.likes where post_id = p_post_id;
  delete from public.saves where post_id = p_post_id;
  delete from public.post_translations where post_id = p_post_id;
  delete from public.notifications where post_id = p_post_id;
  update public.posts set author_id = null, created_by = null, body = '', link_url = null, link_preview = null,
    topics = '{}', mentions = '{}', event_id = null, opportunity_id = null,
    deleted_at = coalesce(deleted_at, now())
  where id = p_post_id;
end;
$$;

-- Runs every minute (see the maintenance migration) and erases posts whose
-- undo window has passed.
create function public.purge_deleted_posts()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_count integer := 0;
begin
  for v_id in select post_id from public.deleted_post_contents where deleted_at < now() - interval '30 seconds' loop
    perform public.erase_post(v_id);
    v_count := v_count + 1;
  end loop;
  delete from public.post_translations where created_at < now() - interval '7 days';
  return v_count;
end;
$$;

revoke execute on function public.erase_post, public.purge_deleted_posts from anon, authenticated;

-- Before a profile goes, its posts are erased (their rows stay as tombstones so
-- other people's replies keep their thread).
create function public.erase_profile_posts()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  for v_id in select id from public.posts where author_id = old.id or created_by = old.id loop
    perform public.erase_post(v_id);
  end loop;
  return old;
end;
$$;

create trigger profiles_erase_posts before delete on public.profiles
  for each row execute function public.erase_profile_posts();

-- ---------------------------------------------------------------------------
-- Pins and polls
-- ---------------------------------------------------------------------------

create function public.pin_post(p_post_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_author uuid;
begin
  select author_id into v_author from public.posts
  where id = p_post_id and parent_id is null and deleted_at is null and status = 'published';
  if v_author is null or not public.can_act_as(v_author) then
    raise exception 'You can pin your own published posts' using errcode = '42501';
  end if;
  update public.profiles set pinned_post_id = p_post_id where id = v_author;
end;
$$;

create function public.unpin_post(p_profile_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.can_act_as(p_profile_id) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  update public.profiles set pinned_post_id = null where id = p_profile_id;
end;
$$;

create function public.vote_poll(p_post_id uuid, p_option_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_poll public.polls;
begin
  if not public.is_active_member() then
    raise exception 'Sign in to vote' using errcode = '42501';
  end if;
  select * into v_poll from public.polls where post_id = p_post_id;
  if v_poll.post_id is null or not public.can_see_post(p_post_id)
     or (select status from public.posts where id = p_post_id) <> 'published' then
    raise exception 'This poll is not open' using errcode = 'P0002';
  end if;
  if exists (select 1 from public.posts where id = p_post_id and (created_by = auth.uid() or public.can_act_as(author_id))) then
    raise exception 'You cannot vote in your own poll' using errcode = '23514';
  end if;
  if v_poll.closes_at < now() then
    raise exception 'This poll has closed' using errcode = '23514';
  end if;
  if not exists (select 1 from public.poll_options where id = p_option_id and post_id = p_post_id) then
    raise exception 'Pick one of the options' using errcode = '23514';
  end if;

  insert into public.poll_votes (post_id, user_id, option_id) values (p_post_id, auth.uid(), p_option_id)
  on conflict (post_id, user_id) do nothing;
  if found then
    update public.poll_options set votes_count = votes_count + 1 where id = p_option_id;
    update public.polls set votes_count = votes_count + 1 where post_id = p_post_id;
  else
    raise exception 'You already voted' using errcode = '23505';
  end if;
end;
$$;

create function public.mark_notifications_read(p_recipient_id uuid default null)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.notifications set read_at = now()
  where recipient_id = coalesce(p_recipient_id, auth.uid())
    and public.can_act_as(recipient_id) and read_at is null
$$;
