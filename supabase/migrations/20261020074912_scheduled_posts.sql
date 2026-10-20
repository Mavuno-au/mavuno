-- Scheduled posts.
--
-- A member writes a top-level post and picks a time up to 30 days ahead. It
-- stays private to them in scheduled_posts until publish_scheduled_posts, run
-- every minute by pg_cron, hands it to create_post acting as that member. So
-- suspension, organisation membership, space membership, blocks, links,
-- images, polls and review are all decided by create_post's own rules at the
-- time the post goes out, not when it was scheduled.
--
-- Once handed over, a row keeps only its outcome: the post it became, or why
-- it could not be posted (with the text, so the member can post it themselves).
-- Handed-over rows are erased after 30 days.

create table public.scheduled_posts (
  id uuid primary key default gen_random_uuid(),
  -- The member who scheduled it, and who create_post acts as.
  created_by uuid not null references public.profiles (id) on delete cascade,
  -- The profile it will appear under (the member or an organisation).
  author_id uuid not null references public.profiles (id) on delete cascade,
  body text not null default '' check (char_length(body) <= 4000),
  language text not null default 'en' check (language ~ '^[a-z]{2,3}$'),
  space_id uuid references public.spaces (id) on delete cascade,
  link_url text check (link_url ~ '^https?://' and char_length(link_url) <= 2000),
  link_preview jsonb check (link_preview is null or jsonb_typeof(link_preview) = 'object'),
  images jsonb not null default '[]'::jsonb check (jsonb_typeof(images) = 'array'),
  poll jsonb check (poll is null or jsonb_typeof(poll) = 'object'),
  scheduled_at timestamptz not null,
  submitted_at timestamptz,
  post_id uuid references public.posts (id) on delete set null,
  error text,
  error_code text,
  created_at timestamptz not null default now(),
  check (submitted_at is not null or (post_id is null and error is null))
);

create index scheduled_posts_due_idx on public.scheduled_posts (scheduled_at) where submitted_at is null;
create index scheduled_posts_created_by_idx on public.scheduled_posts (created_by, scheduled_at);
create index scheduled_posts_author_id_idx on public.scheduled_posts (author_id);
create index scheduled_posts_space_id_idx on public.scheduled_posts (space_id);
create index scheduled_posts_post_id_idx on public.scheduled_posts (post_id);
create index scheduled_posts_submitted_idx on public.scheduled_posts (submitted_at) where submitted_at is not null;

alter table public.scheduled_posts enable row level security;

create policy "Members see their own scheduled posts" on public.scheduled_posts for select to authenticated
  using (created_by = (select auth.uid()));
-- Cancelling a queued post, or clearing one that could not be posted. A post
-- already handed over stays, as its outcome.
create policy "Members cancel their own scheduled posts" on public.scheduled_posts for delete to authenticated
  using (created_by = (select auth.uid()) and post_id is null);

-- Images are uploaded when the post is scheduled. When it will no longer
-- become a post, its files are queued for removal like an erased post's.
create function public.release_scheduled_images(p_images jsonb)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.storage_cleanup (bucket, path)
  select 'media', i ->> 'path' from jsonb_array_elements(p_images) as i
  on conflict do nothing
$$;

create function public.release_deleted_scheduled_images()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.release_scheduled_images(old.images);
  return old;
end;
$$;

create trigger scheduled_posts_release_images after delete on public.scheduled_posts
  for each row when (old.images <> '[]'::jsonb) execute function public.release_deleted_scheduled_images();

-- Arguments as for create_post, without replies, quotes, events or
-- opportunities.
create function public.schedule_post(
  p_scheduled_at timestamptz,
  p_body text,
  p_language text default 'en',
  p_author_id uuid default null,
  p_space_id uuid default null,
  p_link_url text default null,
  p_link_preview jsonb default null,
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
    created_by, author_id, body, language, space_id, link_url, link_preview, images, poll, scheduled_at
  ) values (
    auth.uid(), v_author, v_body, coalesce(nullif(lower(p_language), ''), 'en'), p_space_id,
    v_link, case when v_link is not null then p_link_preview end, v_images, p_poll, p_scheduled_at
  )
  returning id into v_id;

  return v_id;
end;
$$;

-- Runs every minute. Each due post goes through create_post as the member who
-- scheduled it, in its own subtransaction so one failure doesn't hold up the
-- rest; a failure is final and recorded with the reason.
create function public.publish_scheduled_posts()
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
        p_link_preview => v_item.link_preview,
        p_images => v_item.images,
        p_poll => v_item.poll
      );
      update public.scheduled_posts
      set submitted_at = now(), post_id = v_post, body = '', link_url = null, link_preview = null, images = '[]'::jsonb, poll = null
      where id = v_item.id;
      v_count := v_count + 1;
    exception when others then
      update public.scheduled_posts
      set submitted_at = now(), error = sqlerrm, error_code = sqlstate, link_preview = null, images = '[]'::jsonb
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

-- Scheduled posts are part of a member's export.
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

-- Where pg_cron is missing, /api/maintenance runs publish_scheduled_posts too.
do $$
begin
  create extension if not exists pg_cron with schema pg_catalog;
  perform cron.schedule('mavuno-publish-scheduled-posts', '* * * * *', 'select public.publish_scheduled_posts()');
exception when others then
  raise notice 'pg_cron is not available (%), schedule /api/maintenance instead', sqlerrm;
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

revoke all on table public.scheduled_posts from public, anon, authenticated;
grant select, delete on table public.scheduled_posts to authenticated;
grant all on table public.scheduled_posts to service_role;

revoke all on function public.schedule_post(timestamptz, text, text, uuid, uuid, text, jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.schedule_post(timestamptz, text, text, uuid, uuid, text, jsonb, jsonb, jsonb) to authenticated;

revoke all on function public.publish_scheduled_posts(), public.release_scheduled_images(jsonb), public.release_deleted_scheduled_images()
  from public, anon, authenticated;
grant execute on function public.publish_scheduled_posts() to service_role;
grant execute on function public.export_my_data() to authenticated;
