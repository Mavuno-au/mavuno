-- Six gaps found in a review on 23 October 2026.
--
-- 1. Edits that go through can_act_as, can_manage_org or is_space_moderator
--    never asked is_active_member(), so suspended and banned members could
--    still rename themselves and their organisations, rewrite events and
--    opportunities, edit spaces, change RSVPs and invite people to teams.
-- 2. Team invitations had no limit and every one notified, so inviting and
--    removing someone in a loop sent them notifications under any
--    organisation name.
-- 3. The automatic check skipped image descriptions, link cards (written after
--    the check is queued), event links, how to apply and tags on
--    opportunities, and profiles and spaces altogether.
-- 4. Deleting an account or organisation queued none of its photos for
--    erasure, so a direct call or a failure part-way left them public, and a
--    replaced profile photo, banner or event cover stayed in Storage.
-- 5. A ban hid what the person published under their own name only, not what
--    they wrote as an organisation.
-- 6. Mutes were checked against the organisation a reply, quote or mention
--    appeared under, not the person who wrote it.

-- ---------------------------------------------------------------------------
-- 1. Sanctioned members cannot edit
-- ---------------------------------------------------------------------------

-- In WITH CHECK, so a sanctioned member gets an error rather than a save that
-- quietly did nothing. Not in can_act_as, which reading and marking
-- notifications read rely on.
alter policy "People edit profiles they can act as" on public.profiles
  with check ((id = (select auth.uid()) or public.can_manage_org(id)) and (select public.is_active_member()));

alter policy "Hosts edit events" on public.events
  with check (public.can_act_as(host_id) and (select public.is_active_member()));

alter policy "Posters edit opportunities" on public.opportunities
  with check (public.can_act_as(poster_id) and (select public.is_active_member()));

alter policy "Owners and admins add editors and admins" on public.organisation_members
  with check (public.can_manage_org(org_id) and role <> 'owner' and (select public.is_active_member()));

alter policy "People change their RSVP" on public.event_rsvps
  with check (user_id = (select auth.uid()) and (select public.is_active_member()));

create or replace function public.is_space_moderator(p_space_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_active_member() and (public.is_moderator() or exists (
    select 1 from public.space_members
    where space_id = p_space_id and user_id = auth.uid() and role in ('owner', 'moderator')
  ))
$$;

-- ---------------------------------------------------------------------------
-- 2. Team invitations are limited and notify once
-- ---------------------------------------------------------------------------

create or replace function public.check_organisation_member()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.profiles where id = new.org_id and account_type = 'organisation') then
    raise exception 'Not an organisation' using errcode = '23514';
  end if;
  if not exists (select 1 from public.profiles where id = new.user_id and account_type = 'person') then
    raise exception 'Only people can run organisations' using errcode = '23514';
  end if;
  if tg_op = 'INSERT' then
    -- Your own row (creating the organisation) is accepted; anyone else's is
    -- an invitation until they accept it, and cannot be sent across a block.
    if auth.uid() is not null and new.user_id <> auth.uid() then
      if public.is_blocked_between(auth.uid(), new.user_id) then
        raise exception 'You cannot add this person' using errcode = '42501';
      end if;
      perform public.count_towards_limit(auth.uid(), 'team_invitation', 20, interval '1 day',
        'You''ve invited a lot of people to teams today. Try again tomorrow.');
      new.accepted_at := null;
    else
      new.accepted_at := coalesce(new.accepted_at, now());
    end if;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2 and 6. Notifications
-- ---------------------------------------------------------------------------

-- Reply, quote and mention notifications come from a post, which may be
-- written by someone the recipient blocked or muted while appearing under an
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
declare
  v_writer uuid;
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
  if p_type in ('reply', 'quote', 'mention') then
    select created_by into v_writer from public.posts where id = p_post_id;
    if public.is_blocked_between(p_recipient_id, v_writer)
       or exists (select 1 from public.mutes where muter_id = p_recipient_id and muted_id = v_writer) then
      return;
    end if;
  end if;
  if p_type in ('like', 'follow', 'event_rsvp', 'org_added') and exists (
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
-- 3. The automatic check reads everything others see
-- ---------------------------------------------------------------------------

alter table public.background_tasks drop constraint background_tasks_target_type_check;
alter table public.background_tasks
  add constraint background_tasks_target_type_check check (target_type in ('post', 'event', 'opportunity', 'message', 'profile', 'space'));

-- Profiles and spaces are checked on every change to their words or pictures,
-- so they are read whatever an earlier check found.
create or replace function public.automatic_check_subject(p_target_type public.report_target, p_target_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case p_target_type
    when 'post' then (
      select jsonb_build_object(
        'text', concat_ws(E'\n',
          nullif(p.body, ''),
          (select string_agg(o.label, E'\n' order by o.position) from public.poll_options o where o.post_id = p.id),
          (select string_agg(i.alt_text, E'\n' order by i.position) from public.post_images i where i.post_id = p.id and i.alt_text <> ''),
          p.link_preview ->> 'title', p.link_preview ->> 'description', p.link_preview ->> 'site_name'
        ),
        'images', (
          select coalesce(jsonb_agg(i.url order by i.position), '[]'::jsonb) from public.post_images i where i.post_id = p.id
        ) || case when p.link_preview ->> 'image' ~ '^https://' then jsonb_build_array(p.link_preview ->> 'image') else '[]'::jsonb end
      )
      from public.posts p
      where p.id = p_target_id and p.deleted_at is null and p.status <> 'rejected'
        and not exists (select 1 from public.post_flags f where f.post_id = p.id)
    )
    when 'event' then (
      select jsonb_build_object(
        'text', concat_ws(E'\n', e.title, nullif(e.description, ''), e.venue_name, e.address, e.online_url, e.ticket_url),
        'images', case when e.cover_url ~ '^https://' then jsonb_build_array(e.cover_url) else '[]'::jsonb end
      )
      from public.events e
      where e.id = p_target_id and e.status <> 'rejected'
        and not exists (select 1 from public.listing_flags f where f.event_id = e.id)
    )
    when 'opportunity' then (
      select jsonb_build_object(
        'text', concat_ws(E'\n', o.title, o.organisation_name, o.description, o.compensation, o.location_text,
          o.apply_url, o.apply_email, nullif(array_to_string(o.tags, ' '), '')),
        'images', '[]'::jsonb
      )
      from public.opportunities o
      where o.id = p_target_id and o.status <> 'rejected'
        and not exists (select 1 from public.listing_flags f where f.opportunity_id = o.id)
    )
    when 'profile' then (
      select jsonb_build_object(
        'text', concat_ws(E'\n', p.display_name, p.username, p.headline, nullif(p.bio, ''), p.pronouns, p.heritage,
          p.occupation, p.company, p.industry, p.org_category, p.website,
          (select string_agg(concat_ws(' ', l ->> 'label', l ->> 'url'), E'\n') from jsonb_array_elements(p.links) as l)),
        'images', (
          select coalesce(jsonb_agg(u), '[]'::jsonb) from unnest(array[p.avatar_url, p.banner_url]) as u where u ~ '^https://'
        )
      )
      from public.profiles p
      where p.id = p_target_id
    )
    when 'space' then (
      select jsonb_build_object('text', concat_ws(E'\n', s.name, nullif(s.description, ''), s.emoji), 'images', '[]'::jsonb)
      from public.spaces s
      where s.id = p_target_id
    )
  end
$$;

-- Profiles and spaces have no review status, so a flag goes to the
-- moderators' reports as one report without a reporter, refreshed rather than
-- repeated while it is open.
create or replace function public.automatic_hold(p_target_type public.report_target, p_target_id uuid, p_categories text[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_post public.posts;
  v_profile uuid;
  v_snapshot text;
  v_details text;
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
    when 'profile', 'space' then
      if p_target_type = 'profile' then
        v_profile := p_target_id;
      else
        select created_by into v_profile from public.spaces where id = p_target_id;
      end if;
      v_snapshot := left(public.automatic_check_subject(p_target_type, p_target_id) ->> 'text', 4000);
      if v_snapshot is null then
        return;
      end if;
      v_details := left('Flagged by the automatic check: ' || array_to_string(p_categories, ', '), 500);
      update public.reports set details = v_details, snapshot = v_snapshot
      where target_type = p_target_type and target_id = p_target_id and status = 'open'
        and reporter_id is null and details like 'Flagged by the automatic check:%';
      if not found then
        insert into public.reports (reporter_id, target_type, target_id, target_profile_id, reason, details, snapshot)
        values (null, p_target_type, p_target_id, v_profile, 'other', v_details, v_snapshot);
      end if;
    else
      raise exception 'Only posts, events, opportunities, profiles and spaces are checked' using errcode = '22023';
  end case;
end;
$$;

create function public.queue_automatic_check(p_type public.report_target, p_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.background_tasks (kind, target_type, target_id) values ('automatic_check', p_type, p_id)
  on conflict (kind, target_type, target_id) do update set attempts = 0, run_after = now(), failed_at = null, last_error = null
$$;

-- A link card arrives after the post was queued for the check, and comes from
-- a page the poster controls.
create function public.recheck_post_card()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.deleted_at is null and new.status <> 'rejected' and public.needs_automatic_check(new.created_by, new.created_at) then
    perform public.queue_automatic_check('post', new.id);
  end if;
  return null;
end;
$$;

create trigger posts_recheck_card after update of link_preview on public.posts
  for each row when (new.link_preview is not null and new.link_preview is distinct from old.link_preview)
  execute function public.recheck_post_card();

-- Checked for whoever made the change: the member signing up, or the person
-- editing the profile or space. Changes made without a member (the service
-- role, migrations) are not.
create function public.queue_profile_or_space_check()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_person uuid := coalesce(auth.uid(), case when tg_table_name = 'profiles' and tg_op = 'INSERT' then new.id end);
begin
  if v_person is not null and public.needs_automatic_check(v_person, now()) then
    perform public.queue_automatic_check(case tg_table_name when 'profiles' then 'profile' else 'space' end::public.report_target, new.id);
  end if;
  return null;
end;
$$;

create trigger profiles_queue_check after insert on public.profiles
  for each row execute function public.queue_profile_or_space_check();
create trigger profiles_recheck after update of display_name, username, headline, bio, pronouns, heritage, occupation, company,
    industry, org_category, website, links, avatar_url, banner_url on public.profiles
  for each row
  when (row(old.display_name, old.username, old.headline, old.bio, old.pronouns, old.heritage, old.occupation, old.company,
            old.industry, old.org_category, old.website, old.links, old.avatar_url, old.banner_url)
        is distinct from row(new.display_name, new.username, new.headline, new.bio, new.pronouns, new.heritage, new.occupation, new.company,
            new.industry, new.org_category, new.website, new.links, new.avatar_url, new.banner_url))
  execute function public.queue_profile_or_space_check();
create trigger spaces_queue_check after insert on public.spaces
  for each row execute function public.queue_profile_or_space_check();
create trigger spaces_recheck after update of name, description, emoji on public.spaces
  for each row
  when (row(old.name, old.description, old.emoji) is distinct from row(new.name, new.description, new.emoji))
  execute function public.queue_profile_or_space_check();

-- Tags are shown on the listing, so changing them is reviewed like the rest.
drop trigger opportunities_review_edit on public.opportunities;
drop trigger opportunities_recheck on public.opportunities;
create trigger opportunities_review_edit before update of title, organisation_name, description, location_text, apply_url, apply_email, compensation, tags on public.opportunities
  for each row
  when (row(old.title, old.organisation_name, old.description, old.location_text, old.apply_url, old.apply_email, old.compensation, old.tags)
        is distinct from row(new.title, new.organisation_name, new.description, new.location_text, new.apply_url, new.apply_email, new.compensation, new.tags))
  execute function public.review_listing_edit();
create trigger opportunities_recheck after update of title, organisation_name, description, location_text, apply_url, apply_email, compensation, tags on public.opportunities
  for each row
  when (row(old.title, old.organisation_name, old.description, old.location_text, old.apply_url, old.apply_email, old.compensation, old.tags)
        is distinct from row(new.title, new.organisation_name, new.description, new.location_text, new.apply_url, new.apply_email, new.compensation, new.tags))
  execute function public.recheck_listing();

-- A task queued again while a worker had it starts over with no attempts, and
-- the earlier run finishing must not delete or fail it.
create or replace function public.finish_background_task(p_id bigint, p_error text default null, p_retry boolean default false)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_error is null then
    delete from public.background_tasks where id = p_id and attempts > 0;
    return;
  end if;
  update public.background_tasks
  set last_error = left(p_error, 500),
      failed_at = case when p_retry and attempts < 3 then null else now() end
  where id = p_id and attempts > 0;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Files go with what showed them
-- ---------------------------------------------------------------------------

-- The path in the media bucket of one of this project's public Storage URLs.
create function public.media_path(p_url text)
returns text
language sql
stable
set search_path = ''
as $$
  select substr(p_url, char_length(o.origin || '/storage/v1/object/public/media/') + 1)
  from public.storage_origins o
  where starts_with(p_url, o.origin || '/storage/v1/object/public/media/')
  limit 1
$$;

-- Everything under the profile's folder, whatever the spelling, as the purge
-- of under-16 accounts does: avatars, banners, event covers and post photos.
create function public.queue_profile_files()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.storage_cleanup (bucket, path)
  select o.bucket_id, o.name from storage.objects o
  where o.bucket_id = 'media' and public.try_uuid((storage.foldername(o.name))[1]) = old.id
  on conflict do nothing;
  return old;
end;
$$;

create trigger profiles_queue_files before delete on public.profiles
  for each row execute function public.queue_profile_files();

-- A file pointed at again before the daily cleanup ran stays.
create function public.queue_replaced_profile_images()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.storage_cleanup
  where bucket = 'media' and path in (public.media_path(new.avatar_url), public.media_path(new.banner_url));
  insert into public.storage_cleanup (bucket, path)
  select 'media', path from unnest(array[
    case when old.avatar_url is distinct from new.avatar_url then public.media_path(old.avatar_url) end,
    case when old.banner_url is distinct from new.banner_url then public.media_path(old.banner_url) end
  ]) as path
  where path is not null
  on conflict do nothing;
  return null;
end;
$$;

create trigger profiles_queue_replaced_images after update of avatar_url, banner_url on public.profiles
  for each row when (row(old.avatar_url, old.banner_url) is distinct from row(new.avatar_url, new.banner_url))
  execute function public.queue_replaced_profile_images();

-- A host can use one cover for several events, so it goes when none shows it.
create function public.queue_replaced_event_cover()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    delete from public.storage_cleanup where bucket = 'media' and path = public.media_path(new.cover_url);
  end if;
  insert into public.storage_cleanup (bucket, path)
  select 'media', public.media_path(old.cover_url)
  where public.media_path(old.cover_url) is not null
    and not exists (select 1 from public.events e where e.host_id = old.host_id and e.id <> old.id and e.cover_url = old.cover_url)
  on conflict do nothing;
  return null;
end;
$$;

create trigger events_queue_replaced_cover after update of cover_url on public.events
  for each row when (old.cover_url is distinct from new.cover_url)
  execute function public.queue_replaced_event_cover();
create trigger events_queue_cover_on_delete after delete on public.events
  for each row when (old.cover_url is not null)
  execute function public.queue_replaced_event_cover();

-- ---------------------------------------------------------------------------
-- 5. A ban hides what the person wrote as an organisation
-- ---------------------------------------------------------------------------

create or replace function public.hide_published_content(p_profile_id uuid, p_note text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_post public.posts;
begin
  for v_post in
    select * from public.posts
    where (author_id = p_profile_id or created_by = p_profile_id) and status = 'published' and deleted_at is null
    for update
  loop
    update public.posts set status = 'rejected', moderation_note = p_note where id = v_post.id;
    perform public.count_post(v_post, -1);
  end loop;
  update public.events set status = 'rejected', rejection_reason = p_note
  where (host_id = p_profile_id or created_by = p_profile_id) and status = 'published';
  update public.opportunities set status = 'rejected', rejection_reason = p_note
  where (poster_id = p_profile_id or created_by = p_profile_id) and status = 'published';
end;
$$;

create or replace function public.restore_hidden_content(p_profile_id uuid, p_note text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_post_id uuid;
begin
  for v_post_id in
    select id from public.posts
    where (author_id = p_profile_id or created_by = p_profile_id) and status = 'rejected' and moderation_note = p_note
  loop
    perform public.publish_post(v_post_id);
  end loop;
  update public.events set status = 'published', rejection_reason = null
  where (host_id = p_profile_id or created_by = p_profile_id) and rejection_reason = p_note;
  update public.opportunities set status = 'published', rejection_reason = null
  where (poster_id = p_profile_id or created_by = p_profile_id) and rejection_reason = p_note;
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

-- Internal: only triggers and other database functions call these.
revoke all on function
  public.queue_automatic_check(public.report_target, uuid),
  public.recheck_post_card(),
  public.queue_profile_or_space_check(),
  public.media_path(text),
  public.queue_profile_files(),
  public.queue_replaced_profile_images(),
  public.queue_replaced_event_cover()
from public, anon, authenticated;
