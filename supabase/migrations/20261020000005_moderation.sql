-- Review of pending content, reports, and moderator tools.
--
-- Moderators (profile_settings.site_role) review pending posts, events and
-- opportunities oldest first, and act on reports. Approvals do not notify;
-- rejections tell the author, with the reason when one is given, without
-- revealing who moderated. Reporters stay anonymous to moderators.

create type public.report_target as enum ('post', 'profile', 'message', 'event', 'opportunity', 'space');
create type public.report_reason as enum ('spam', 'scam', 'harassment', 'hate', 'misinformation', 'sexual_content', 'violence', 'private_information', 'impersonation', 'other');
create type public.report_status as enum ('open', 'actioned', 'dismissed');

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid references public.profiles (id) on delete set null,
  target_type public.report_target not null,
  target_id uuid not null,
  -- The profile responsible for the reported content.
  target_profile_id uuid references public.profiles (id) on delete cascade,
  reason public.report_reason not null,
  details text check (char_length(details) <= 500),
  -- What was reported, as it was. Moderators are not in private conversations,
  -- so message reports need it.
  snapshot text check (char_length(snapshot) <= 4000),
  status public.report_status not null default 'open',
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

create index reports_open_idx on public.reports (created_at) where status = 'open';
create index reports_target_idx on public.reports (target_type, target_id);
create index reports_profile_idx on public.reports (target_profile_id, created_at desc);
create unique index reports_once_idx on public.reports (reporter_id, target_type, target_id);

create table public.moderation_actions (
  id bigint generated always as identity primary key,
  moderator_id uuid references public.profiles (id) on delete set null,
  action text not null,
  target_type public.report_target not null,
  target_id uuid not null,
  reason text check (char_length(reason) <= 280),
  created_at timestamptz not null default now()
);

create index moderation_actions_target_idx on public.moderation_actions (target_type, target_id, created_at desc);

alter table public.reports enable row level security;
alter table public.moderation_actions enable row level security;
revoke insert, update, delete on public.reports, public.moderation_actions from anon, authenticated;

create policy "Moderators see reports" on public.reports for select to authenticated using (public.is_moderator());
create policy "Moderators see the moderation log" on public.moderation_actions for select to authenticated using (public.is_moderator());

-- ---------------------------------------------------------------------------
-- Listings start pending unless their creator has a good reputation
-- ---------------------------------------------------------------------------

create function public.prepare_listing()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (
    select count(*) from public.events where created_by = new.created_by and created_at > now() - interval '1 day'
  ) + (
    select count(*) from public.opportunities where created_by = new.created_by and created_at > now() - interval '1 day'
  ) >= 10 then
    raise exception 'You have reached today''s limit for new listings' using errcode = '23514';
  end if;

  new.status := case when public.has_good_reputation(new.created_by) then 'published' else 'pending' end::public.content_status;
  new.rejection_reason := null;
  new.created_at := now();
  if tg_table_name = 'events' then
    new.going_count := 0;
    new.interested_count := 0;
  end if;
  return new;
end;
$$;

create trigger events_prepare before insert on public.events
  for each row execute function public.prepare_listing();
create trigger opportunities_prepare before insert on public.opportunities
  for each row execute function public.prepare_listing();

-- ---------------------------------------------------------------------------
-- Reports
-- ---------------------------------------------------------------------------

-- Posts are held for review once this many different people report them.
create function public.report_hold_threshold()
returns integer
language sql
immutable
set search_path = ''
as $$ select 3 $$;

create function public.report_content(
  p_target_type public.report_target,
  p_target_id uuid,
  p_reason public.report_reason,
  p_details text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile uuid;
  v_snapshot text;
  v_post public.posts;
begin
  if not public.is_active_member() then
    raise exception 'Sign in to report' using errcode = '42501';
  end if;
  if (select count(*) from public.reports where reporter_id = auth.uid() and created_at > now() - interval '1 minute') >= 5 then
    raise exception 'You can file 5 reports a minute' using errcode = '23514';
  end if;

  case p_target_type
    when 'post' then
      select author_id, body into v_profile, v_snapshot from public.posts
      where id = p_target_id and status = 'published' and public.can_see_post(id);
    when 'profile' then
      select id, display_name || ' (@' || username || ')' || E'\n' || bio into v_profile, v_snapshot
      from public.profiles where id = p_target_id;
    when 'message' then
      select m.sender_id, m.body into v_profile, v_snapshot from public.messages m
      where m.id = p_target_id and m.removed_at is null and public.is_participant(m.conversation_id);
    when 'event' then
      select host_id, title || E'\n' || description into v_profile, v_snapshot
      from public.events where id = p_target_id and status = 'published';
    when 'opportunity' then
      select poster_id, title || E'\n' || description into v_profile, v_snapshot
      from public.opportunities where id = p_target_id and status = 'published';
    when 'space' then
      select created_by, name || E'\n' || description into v_profile, v_snapshot
      from public.spaces where id = p_target_id and not is_official;
  end case;

  if v_snapshot is null then
    raise exception 'That is no longer available' using errcode = 'P0002';
  end if;
  if public.can_act_as(v_profile) then
    raise exception 'You cannot report yourself' using errcode = '23514';
  end if;

  insert into public.reports (reporter_id, target_type, target_id, target_profile_id, reason, details, snapshot)
  values (auth.uid(), p_target_type, p_target_id, v_profile, p_reason, nullif(left(trim(p_details), 500), ''), left(v_snapshot, 4000))
  on conflict (reporter_id, target_type, target_id) do nothing;
  if not found then
    raise exception 'You already reported this' using errcode = '23505';
  end if;

  if p_target_type = 'post' and (
    select count(distinct reporter_id) from public.reports
    where target_type = 'post' and target_id = p_target_id and status = 'open'
  ) >= public.report_hold_threshold() then
    select * into v_post from public.posts where id = p_target_id and status = 'published' for update;
    if v_post.id is not null then
      update public.posts set status = 'pending', moderation_note = 'Held for review after reports' where id = p_target_id;
      perform public.count_post(v_post, -1);
    end if;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Moderator actions
-- ---------------------------------------------------------------------------

create function public.require_moderator()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_moderator() then
    raise exception 'Moderators only' using errcode = '42501';
  end if;
end;
$$;

create function public.log_moderation(p_action text, p_target_type public.report_target, p_target_id uuid, p_reason text)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.moderation_actions (moderator_id, action, target_type, target_id, reason)
  values (auth.uid(), p_action, p_target_type, p_target_id, nullif(left(trim(p_reason), 280), ''))
$$;

create function public.close_reports(p_target_type public.report_target, p_target_id uuid, p_status public.report_status)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.reports set status = p_status, resolved_at = now()
  where target_type = p_target_type and target_id = p_target_id and status = 'open'
$$;

revoke execute on function public.log_moderation, public.close_reports from anon, authenticated;

-- Approves or rejects a post, event or opportunity. Rejecting published
-- content removes it from public view; rejecting a message removes it.
create function public.moderate_content(
  p_target_type public.report_target,
  p_target_id uuid,
  p_approve boolean,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile uuid;
  v_post public.posts;
  v_reason text := nullif(left(trim(p_reason), 280), '');
  v_label text;
begin
  perform public.require_moderator();

  case p_target_type
    when 'post' then
      select * into v_post from public.posts where id = p_target_id for update;
      v_profile := v_post.author_id;
      v_label := case when v_post.parent_id is null then 'post' else 'reply' end;
      if p_approve then
        perform public.publish_post(p_target_id);
      elsif v_post.status <> 'rejected' then
        update public.posts set status = 'rejected', moderation_note = v_reason where id = p_target_id;
        if v_post.status = 'published' then
          perform public.count_post(v_post, -1);
        end if;
      end if;
    when 'event' then
      update public.events
      set status = case when p_approve then 'published' else 'rejected' end::public.content_status,
          rejection_reason = case when p_approve then null else v_reason end
      where id = p_target_id returning host_id into v_profile;
      v_label := 'event';
    when 'opportunity' then
      update public.opportunities
      set status = case when p_approve then 'published' else 'rejected' end::public.content_status,
          rejection_reason = case when p_approve then null else v_reason end
      where id = p_target_id returning poster_id into v_profile;
      v_label := 'opportunity';
    when 'message' then
      if not p_approve then
        update public.messages set removed_at = now(), body = '', image_paths = '{}'
        where id = p_target_id returning sender_id into v_profile;
      end if;
      v_label := 'message';
    when 'space' then
      if not p_approve then
        delete from public.spaces where id = p_target_id and not is_official returning created_by into v_profile;
      end if;
      v_label := 'space';
    else
      raise exception 'Use moderate_suspend for profiles' using errcode = '22023';
  end case;

  perform public.close_reports(p_target_type, p_target_id, case when p_approve then 'dismissed' else 'actioned' end::public.report_status);

  if not p_approve then
    perform public.notify(
      v_profile, null, 'moderation', case when p_target_type = 'post' then p_target_id end, null,
      'Your ' || v_label || ' was removed for breaking the community rules.' || coalesce(' Reason: ' || v_reason, '')
    );
  end if;

  perform public.log_moderation(case when p_approve then 'approve' else 'reject' end, p_target_type, p_target_id, v_reason);
end;
$$;

-- Approves many pending posts at once, oldest first.
create function public.moderate_approve_posts(p_post_ids uuid[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  perform public.require_moderator();
  foreach v_id in array p_post_ids[1:100] loop
    perform public.moderate_content('post', v_id, true);
  end loop;
end;
$$;

create function public.moderate_dismiss_reports(p_target_type public.report_target, p_target_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.require_moderator();
  perform public.close_reports(p_target_type, p_target_id, 'dismissed');
  -- A post held because of reports comes back.
  if p_target_type = 'post' then
    perform public.publish_post(p_target_id)
    from public.posts where id = p_target_id and status = 'pending' and moderation_note = 'Held for review after reports';
  end if;
  perform public.log_moderation('dismiss', p_target_type, p_target_id, null);
end;
$$;

create function public.moderate_suspend(p_profile_id uuid, p_days integer, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.require_moderator();
  if exists (select 1 from public.profile_settings where id = p_profile_id and site_role <> 'member') and not public.is_admin() then
    raise exception 'Only admins can suspend moderators' using errcode = '42501';
  end if;

  update public.profile_settings
  set suspended_until = case when p_days > 0 then now() + make_interval(days => least(p_days, 3650)) end
  where id = p_profile_id;

  if p_days > 0 then
    perform public.close_reports('profile', p_profile_id, 'actioned');
    perform public.notify(p_profile_id, null, 'moderation', null, null,
      'Your account is suspended for ' || p_days || ' days for breaking the community rules.'
        || coalesce(' Reason: ' || nullif(trim(p_reason), ''), ''));
  end if;
  perform public.log_moderation(case when p_days > 0 then 'suspend' else 'unsuspend' end, 'profile', p_profile_id, p_reason);
end;
$$;

create function public.moderate_verify_organisation(p_org_id uuid, p_verified boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.require_moderator();
  update public.profiles set org_verified = p_verified where id = p_org_id and account_type = 'organisation';
  perform public.log_moderation(case when p_verified then 'verify' else 'unverify' end, 'profile', p_org_id, null);
end;
$$;

create function public.admin_set_site_role(p_profile_id uuid, p_role public.site_role)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Admins only' using errcode = '42501';
  end if;
  if p_profile_id = auth.uid() then
    raise exception 'You cannot change your own role' using errcode = '23514';
  end if;
  update public.profile_settings set site_role = p_role where id = p_profile_id;
  perform public.log_moderation('role:' || p_role, 'profile', p_profile_id, null);
end;
$$;

create function public.admin_update_site_settings(p_premoderation boolean, p_translations boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Admins only' using errcode = '42501';
  end if;
  update public.site_settings set premoderation = p_premoderation, translations = p_translations, updated_at = now();
end;
$$;

-- ---------------------------------------------------------------------------
-- Queues
-- ---------------------------------------------------------------------------

-- Content waiting for review, oldest first.
create view public.review_queue
with (security_invoker = true)
as
select 'post'::public.report_target as target_type, p.id as target_id, p.author_id as profile_id, p.created_by,
  p.body as content, p.language, p.moderation_note as note, p.parent_id, p.created_at
from public.posts p
where p.status = 'pending' and p.deleted_at is null and public.is_moderator()
union all
select 'event', e.id, e.host_id, e.created_by, e.title || E'\n\n' || e.description, 'en', null, null, e.created_at
from public.events e where e.status = 'pending' and public.is_moderator()
union all
select 'opportunity', o.id, o.poster_id, o.created_by, o.title || E'\n\n' || o.description, 'en', null, null, o.created_at
from public.opportunities o where o.status = 'pending' and public.is_moderator();

-- Open reports grouped by what they are about, without reporters' identities.
create view public.report_queue
with (security_invoker = true)
as
select
  r.target_type,
  r.target_id,
  r.target_profile_id,
  count(*)::integer as report_count,
  min(r.created_at) as first_reported_at,
  array_agg(distinct r.reason) as reasons,
  (array_agg(r.snapshot order by r.created_at desc))[1] as snapshot,
  jsonb_agg(jsonb_build_object('reason', r.reason, 'details', r.details, 'created_at', r.created_at) order by r.created_at desc) as reports
from public.reports r
where r.status = 'open' and public.is_moderator()
group by r.target_type, r.target_id, r.target_profile_id;
