-- What the terms, privacy policy and community rules promise, enforced here:
--
-- 1. Age assurance (Online Safety Act 2021, Part 4A). Members confirm they are
--    16 or older with a date of birth that is checked and never stored: only
--    when it was confirmed is kept. Until then they can read but not act.
--    Someone who says they are under 16, or whom a moderator believes is,
--    is deactivated: their posts and listings are hidden, a review by email
--    can reinstate them, and after 30 days the account is deleted.
--    age_checks keeps a record of those steps for eSafety (docs/AGE_ASSURANCE.md).
-- 2. Removals and suspensions name the rule they were made under, and the
--    notice links to an appeal (by email, within 30 days).
-- 3. Reports can be about intimate images, someone under 16, or a legal
--    complaint such as defamation. Legal complaints carry the complainant's
--    contact details and a 7-day target (terms, section 7).
--
-- New report_reason values cannot be used in this transaction, so they are
-- compared as text below.

alter type public.report_reason add value if not exists 'intimate_images';
alter type public.report_reason add value if not exists 'under_16';
alter type public.report_reason add value if not exists 'legal';

create type public.community_rule as enum ('respect', 'safety', 'honesty', 'opportunities', 'right_place', 'terms', 'law', 'age');
create type public.age_check_step as enum ('declared_under_16', 'flagged', 'reinstated', 'deleted');
create type public.age_check_basis as enum ('self_declared', 'report', 'posts', 'profile', 'document', 'video_call', 'other');

-- ---------------------------------------------------------------------------
-- Columns
-- ---------------------------------------------------------------------------

alter table public.profile_settings
  add column age_confirmed_at timestamptz,
  add column age_deactivated_at timestamptz;

create index profile_settings_age_deactivated_idx on public.profile_settings (age_deactivated_at) where age_deactivated_at is not null;

alter table public.moderation_actions add column rule public.community_rule;

alter table public.notifications
  add column rule public.community_rule,
  add column moderation_action_id bigint references public.moderation_actions (id) on delete set null;

create index notifications_moderation_action_idx on public.notifications (moderation_action_id);

alter table public.reports
  add column contact text check (char_length(contact) <= 200),
  add constraint reports_legal_contact check (reason::text <> 'legal' or contact is not null);

-- ---------------------------------------------------------------------------
-- The record of age checks
-- ---------------------------------------------------------------------------

-- No dates of birth and no free text: what happened, on what basis, when and
-- by which moderator. Rows outlive the account they were about.
create table public.age_checks (
  id bigint generated always as identity primary key,
  profile_id uuid references public.profiles (id) on delete set null,
  step public.age_check_step not null,
  basis public.age_check_basis,
  moderator_id uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create index age_checks_profile_idx on public.age_checks (profile_id, created_at desc);
create index age_checks_moderator_idx on public.age_checks (moderator_id);
create index age_checks_created_idx on public.age_checks (created_at desc);

alter table public.age_checks enable row level security;
create policy "Moderators read age checks" on public.age_checks for select to authenticated using ((select public.is_moderator()));

-- ---------------------------------------------------------------------------
-- Members act only once their age is confirmed and while not deactivated
-- ---------------------------------------------------------------------------

create or replace function public.is_active_member()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    join public.profile_settings s on s.id = p.id
    where p.id = auth.uid() and p.account_type = 'person'
      and (s.suspended_until is null or s.suspended_until < now())
      and s.age_confirmed_at is not null
      and s.age_deactivated_at is null
  )
$$;

create function public.meets_minimum_age(p_birth_date date)
returns boolean
language sql
stable
set search_path = ''
as $$
  select p_birth_date is not null and (p_birth_date + interval '16 years')::date <= (now() at time zone 'Australia/Sydney')::date
$$;

-- The sign-up form checks the date of birth on the server and sends only
-- age_confirmed, so the date never reaches the database.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_username text := lower(coalesce(v_meta ->> 'username', ''));
  v_display text := coalesce(
    nullif(trim(v_meta ->> 'display_name'), ''),
    nullif(trim(v_meta ->> 'full_name'), ''),
    nullif(trim(v_meta ->> 'name'), '')
  );
  v_avatar text := v_meta ->> 'avatar_url';
begin
  if v_username !~ '^[a-z0-9_]{3,30}$'
     or public.is_reserved_username(v_username)
     or exists (select 1 from public.profiles where username = v_username) then
    v_username := 'member_' || substr(replace(new.id::text, '-', ''), 1, 10);
  end if;

  insert into public.profiles (id, account_type, username, display_name, avatar_url)
  values (
    new.id, 'person', v_username, left(coalesce(v_display, v_username), 60),
    case when v_avatar ~ '^https://' then v_avatar end
  );

  if v_meta ->> 'age_confirmed' = 'true' then
    update public.profile_settings set age_confirmed_at = now() where id = new.id;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Moderation records and notices
-- ---------------------------------------------------------------------------

create function public.rule_phrase(p_rule public.community_rule)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_rule
    when 'respect' then 'under rule 1 of the community rules (Respect people)'
    when 'safety' then 'under rule 2 of the community rules (Keep people safe)'
    when 'honesty' then 'under rule 3 of the community rules (Be honest)'
    when 'opportunities' then 'under rule 4 of the community rules (Fair jobs and opportunities)'
    when 'right_place' then 'under rule 5 of the community rules (Use the right place)'
    when 'terms' then 'under section 4 of the terms of use (What you mustn''t do)'
    when 'law' then 'because the law requires it (section 6 of the terms of use)'
    when 'age' then 'under section 1 of the terms of use (Who can use Mavuno)'
  end
$$;

create function public.record_moderation(p_action text, p_target_type public.report_target, p_target_id uuid, p_reason text, p_rule public.community_rule)
returns bigint
language sql
security definer
set search_path = ''
as $$
  insert into public.moderation_actions (moderator_id, action, target_type, target_id, reason, rule)
  values (auth.uid(), p_action, p_target_type, p_target_id, nullif(left(trim(p_reason), 280), ''), p_rule)
  returning id
$$;

create function public.notify_moderation(p_recipient_id uuid, p_post_id uuid, p_message text, p_rule public.community_rule, p_action_id bigint)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.notifications (recipient_id, type, post_id, message, rule, moderation_action_id)
  select p_recipient_id, 'moderation', p_post_id, left(p_message, 500), p_rule, p_action_id
  where p_recipient_id is not null
$$;

drop function public.moderate_content(public.report_target, uuid, boolean, text);

-- Approves or rejects a post, event or opportunity, or removes a message or
-- space. Removing anything needs the rule it broke, which the notice names.
create function public.moderate_content(
  p_target_type public.report_target,
  p_target_id uuid,
  p_approve boolean,
  p_reason text default null,
  p_rule public.community_rule default null
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
  v_action bigint;
begin
  perform public.require_moderator();
  if not p_approve and (p_rule is null or p_rule = 'age') then
    raise exception 'Choose the rule it breaks' using errcode = '23514';
  end if;

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
  v_action := public.record_moderation(case when p_approve then 'approve' else 'reject' end, p_target_type, p_target_id, v_reason, case when p_approve then null else p_rule end);

  if not p_approve then
    perform public.notify_moderation(
      v_profile, case when p_target_type = 'post' then p_target_id end,
      'Your ' || v_label || ' was removed ' || public.rule_phrase(p_rule) || '.' || coalesce(' Reason: ' || v_reason, ''),
      p_rule, v_action
    );
  end if;
end;
$$;

drop function public.moderate_suspend(uuid, integer, text);

create function public.moderate_suspend(p_profile_id uuid, p_days integer, p_reason text default null, p_rule public.community_rule default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reason text := nullif(left(trim(p_reason), 280), '');
  v_action bigint;
begin
  perform public.require_moderator();
  if exists (select 1 from public.profile_settings where id = p_profile_id and site_role <> 'member') and not public.is_admin() then
    raise exception 'Only admins can suspend moderators' using errcode = '42501';
  end if;
  if p_days > 0 and (p_rule is null or p_rule = 'age') then
    raise exception 'Choose the rule it breaks' using errcode = '23514';
  end if;

  update public.profile_settings
  set suspended_until = case when p_days > 0 then now() + make_interval(days => least(p_days, 3650)) end
  where id = p_profile_id;

  v_action := public.record_moderation(case when p_days > 0 then 'suspend' else 'unsuspend' end, 'profile', p_profile_id, v_reason, case when p_days > 0 then p_rule end);
  if p_days > 0 then
    perform public.close_reports('profile', p_profile_id, 'actioned');
    perform public.notify_moderation(p_profile_id, null,
      'Your account is suspended for ' || p_days || case when p_days = 1 then ' day ' else ' days ' end || public.rule_phrase(p_rule) || '.'
        || coalesce(' Reason: ' || v_reason, ''),
      p_rule, v_action);
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Deactivating accounts of people under 16
-- ---------------------------------------------------------------------------

-- Hides what the person published, so it can come back unchanged if a review
-- finds they are 16 or older.
create function public.deactivate_for_age(p_profile_id uuid, p_step public.age_check_step, p_basis public.age_check_basis)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_post public.posts;
begin
  update public.profile_settings s set age_deactivated_at = now()
  from public.profiles p
  where s.id = p_profile_id and p.id = s.id and p.account_type = 'person' and s.age_deactivated_at is null;
  if not found then
    return false;
  end if;

  for v_post in
    select * from public.posts where author_id = p_profile_id and status = 'published' and deleted_at is null for update
  loop
    update public.posts set status = 'rejected', moderation_note = 'Account deactivated' where id = v_post.id;
    perform public.count_post(v_post, -1);
  end loop;
  update public.events set status = 'rejected', rejection_reason = 'Account deactivated' where host_id = p_profile_id and status = 'published';
  update public.opportunities set status = 'rejected', rejection_reason = 'Account deactivated' where poster_id = p_profile_id and status = 'published';

  insert into public.age_checks (profile_id, step, basis, moderator_id)
  values (p_profile_id, p_step, p_basis, case when p_step = 'flagged' then auth.uid() end);
  return true;
end;
$$;

-- The notice the person sees when they next sign in.
create function public.age_notice(p_self_declared boolean)
returns text
language sql
immutable
set search_path = ''
as $$
  select 'Your account is deactivated because ' || case when p_self_declared then 'you told us you''re' else 'we believe you''re' end
    || ' under 16. Australian law doesn''t allow people under 16 to have social media accounts. Your posts are hidden, and your'
    || ' account and its information will be deleted after 30 days unless a review finds you''re 16 or older.'
$$;

-- A member confirms their age once. The date of birth is only compared here.
create function public.confirm_age(p_birth_date date)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and account_type = 'person') then
    raise exception 'Sign in first' using errcode = '42501';
  end if;
  if p_birth_date is null or p_birth_date > (now() at time zone 'Australia/Sydney')::date or p_birth_date < date '1900-01-01' then
    raise exception 'Enter your date of birth' using errcode = '23514';
  end if;
  if exists (select 1 from public.profile_settings where id = auth.uid() and age_deactivated_at is not null) then
    raise exception 'Your account is deactivated' using errcode = '42501';
  end if;

  if public.meets_minimum_age(p_birth_date) then
    update public.profile_settings set age_confirmed_at = coalesce(age_confirmed_at, now()) where id = auth.uid();
    return true;
  end if;

  if public.deactivate_for_age(auth.uid(), 'declared_under_16', 'self_declared') then
    perform public.notify_moderation(auth.uid(), null, public.age_notice(true), 'age', null);
  end if;
  return false;
end;
$$;

create function public.moderate_deactivate_under_16(p_profile_id uuid, p_basis public.age_check_basis)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.require_moderator();
  if p_basis not in ('report', 'posts', 'profile', 'other') then
    raise exception 'Say why you believe they are under 16' using errcode = '23514';
  end if;
  if exists (select 1 from public.profile_settings where id = p_profile_id and site_role <> 'member') and not public.is_admin() then
    raise exception 'Only admins can deactivate moderators' using errcode = '42501';
  end if;
  if not public.deactivate_for_age(p_profile_id, 'flagged', p_basis) then
    raise exception 'That account is already deactivated, or is not a person' using errcode = '23514';
  end if;
  perform public.close_reports('profile', p_profile_id, 'actioned');
  perform public.notify_moderation(p_profile_id, null, public.age_notice(false), 'age',
    public.record_moderation('deactivate', 'profile', p_profile_id, null, 'age'));
end;
$$;

-- After a review by email finds the person is 16 or older. Their age counts
-- as confirmed, and what was hidden comes back.
create function public.moderate_reinstate_age(p_profile_id uuid, p_basis public.age_check_basis)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_post_id uuid;
begin
  perform public.require_moderator();
  if p_basis not in ('document', 'video_call', 'other') then
    raise exception 'Say how they showed they are 16 or older' using errcode = '23514';
  end if;

  update public.profile_settings set age_deactivated_at = null, age_confirmed_at = now()
  where id = p_profile_id and age_deactivated_at is not null;
  if not found then
    raise exception 'That account is not deactivated' using errcode = '23514';
  end if;

  for v_post_id in
    select id from public.posts where author_id = p_profile_id and status = 'rejected' and moderation_note = 'Account deactivated'
  loop
    perform public.publish_post(v_post_id);
  end loop;
  update public.events set status = 'published', rejection_reason = null where host_id = p_profile_id and rejection_reason = 'Account deactivated';
  update public.opportunities set status = 'published', rejection_reason = null where poster_id = p_profile_id and rejection_reason = 'Account deactivated';

  insert into public.age_checks (profile_id, step, basis, moderator_id) values (p_profile_id, 'reinstated', p_basis, auth.uid());
  perform public.record_moderation('reinstate', 'profile', p_profile_id, null, 'age');
  perform public.notify_moderation(p_profile_id, null, 'Your account is active again. Thanks for confirming your age.', null, null);
end;
$$;

-- Accounts still deactivated 30 days on are deleted with everything in them,
-- as the privacy policy says. Their files are queued for /api/maintenance.
create function public.purge_deactivated_accounts()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_count integer := 0;
begin
  for v_id in
    select id from public.profile_settings where age_deactivated_at < now() - interval '30 days'
  loop
    insert into public.storage_cleanup (bucket, path)
    select o.bucket_id, o.name from storage.objects o where o.bucket_id = 'media' and o.name like v_id::text || '/%'
    on conflict do nothing;
    insert into public.age_checks (profile_id, step) values (v_id, 'deleted');
    delete from auth.users where id = v_id;
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

do $$
begin
  create extension if not exists pg_cron with schema pg_catalog;
  perform cron.schedule('mavuno-purge-deactivated-accounts', '17 3 * * *', 'select public.purge_deactivated_accounts()');
exception when others then
  raise notice 'pg_cron is not available (%), schedule /api/maintenance instead', sqlerrm;
end;
$$;

-- ---------------------------------------------------------------------------
-- Reports
-- ---------------------------------------------------------------------------

drop function public.report_content(public.report_target, uuid, public.report_reason, text);

create function public.report_content(
  p_target_type public.report_target,
  p_target_id uuid,
  p_reason public.report_reason,
  p_details text default null,
  p_contact text default null
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
  v_details text := nullif(left(trim(p_details), 500), '');
  v_contact text := nullif(left(trim(p_contact), 200), '');
begin
  if not public.is_active_member() then
    raise exception 'Sign in to report' using errcode = '42501';
  end if;
  if (select count(*) from public.reports where reporter_id = auth.uid() and created_at > now() - interval '1 minute') >= 5 then
    raise exception 'You can file 5 reports a minute' using errcode = '23514';
  end if;
  if p_reason::text = 'legal' and (v_contact is null or v_details is null) then
    raise exception 'Explain the problem and add how we can contact you' using errcode = '23514';
  end if;
  if p_reason::text <> 'legal' then
    v_contact := null;
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

  insert into public.reports (reporter_id, target_type, target_id, target_profile_id, reason, details, snapshot, contact)
  values (auth.uid(), p_target_type, p_target_id, v_profile, p_reason, v_details, left(v_snapshot, 4000), v_contact)
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

-- Legal complaints are due 7 days after the first one (terms, section 7).
create or replace view public.report_queue
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
  jsonb_agg(jsonb_build_object('reason', r.reason, 'details', r.details, 'contact', r.contact, 'created_at', r.created_at) order by r.created_at desc) as reports,
  min(r.created_at) filter (where r.reason::text = 'legal') + interval '7 days' as respond_by
from public.reports r
where r.status = 'open' and public.is_moderator()
group by r.target_type, r.target_id, r.target_profile_id;

-- ---------------------------------------------------------------------------
-- Notifications carry the rule and the decision they are about
-- ---------------------------------------------------------------------------

create or replace view public.notification_details
with (security_invoker = true)
as
select
  n.id,
  n.recipient_id,
  n.type,
  n.post_id,
  n.event_id,
  n.message,
  n.read_at,
  n.created_at,
  public.profile_card(n.actor_id) as actor,
  exists (select 1 from public.follows f where f.follower_id = n.recipient_id and f.followee_id = n.actor_id) as following_actor,
  (
    select jsonb_build_object('id', p.id, 'body', left(p.body, 400), 'parent_id', p.parent_id, 'root_id', p.root_id, 'quote_id', p.quote_id)
    from public.posts p where p.id = n.post_id
  ) as post,
  (select jsonb_build_object('id', e.id, 'title', e.title, 'starts_at', e.starts_at) from public.events e where e.id = n.event_id) as event,
  n.rule,
  n.moderation_action_id
from public.notifications n
where not public.is_blocked_with_viewer(n.actor_id)
  and not public.is_muted_by_viewer(n.actor_id)
  and not exists (select 1 from public.posts p where p.id = n.post_id and p.deleted_at is not null);

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

revoke all on function
  public.rule_phrase(public.community_rule),
  public.age_notice(boolean),
  public.record_moderation(text, public.report_target, uuid, text, public.community_rule),
  public.notify_moderation(uuid, uuid, text, public.community_rule, bigint),
  public.deactivate_for_age(uuid, public.age_check_step, public.age_check_basis),
  public.purge_deactivated_accounts()
from public, anon, authenticated;

revoke all on function
  public.meets_minimum_age(date),
  public.confirm_age(date),
  public.moderate_content(public.report_target, uuid, boolean, text, public.community_rule),
  public.moderate_suspend(uuid, integer, text, public.community_rule),
  public.moderate_deactivate_under_16(uuid, public.age_check_basis),
  public.moderate_reinstate_age(uuid, public.age_check_basis),
  public.report_content(public.report_target, uuid, public.report_reason, text, text)
from public;

grant select on public.age_checks to authenticated;
grant select (contact) on public.reports to authenticated;

-- The sign-up page checks a date of birth before there is an account.
grant execute on function public.meets_minimum_age(date) to anon, authenticated;

grant execute on function
  public.confirm_age(date),
  public.moderate_content(public.report_target, uuid, boolean, text, public.community_rule),
  public.moderate_suspend(uuid, integer, text, public.community_rule),
  public.moderate_deactivate_under_16(uuid, public.age_check_basis),
  public.moderate_reinstate_age(uuid, public.age_check_basis),
  public.report_content(public.report_target, uuid, public.report_reason, text, text)
to authenticated;

grant execute on function public.purge_deactivated_accounts() to service_role;
