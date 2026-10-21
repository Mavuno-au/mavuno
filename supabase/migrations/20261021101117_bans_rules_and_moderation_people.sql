-- Bans that outlive the account, finer suspensions, the rules before the
-- first post, a record moderators can read, and reports that carry weight.
--
-- 1. A ban (moderate_ban) hides what the person published, cancels their
--    scheduled posts and keeps a peppered hash of their sign-in identities
--    (normalised email address, Google subject) in banned_identities. The
--    pepper lives in Vault as 'identity_pepper', so the table alone cannot
--    be reversed by hashing likely addresses. Deleting the account while
--    suspended or banned writes the same hashes, with the suspension's end,
--    so deleting doesn't shorten anything. Supabase Auth asks
--    before_user_created on every sign-up and refuses a match. This is the
--    one exception to "everything about a person is erased with their
--    account", named in the privacy policy and PRODUCT.md.
-- 2. Suspensions take an interval (1 hour to 30 days in the app) and extend
--    an existing one rather than replacing it. The notice says when it ends.
-- 3. Members accept the community rules once (accept_rules) before the
--    database lets them create a post, event, opportunity or scheduled post.
-- 4. moderation_actions names the person responsible, and moderation_log
--    shows moderators who decided what about whom. moderate_restore undoes a
--    decision after a successful appeal; moderate_lift_suspension ends a
--    suspension or ban early.
-- 5. Only reports from members with standing (a member for a week, something
--    published, not suspended, no report of theirs dismissed in the last 30
--    days; moderators always) count towards the 3-report hold and the week
--    of review after a report. A report a moderator actioned always counts.

-- ---------------------------------------------------------------------------
-- Columns
-- ---------------------------------------------------------------------------

alter table public.profile_settings
  add column banned_at timestamptz,
  add column rules_accepted_at timestamptz;

create index profile_settings_sanctioned_idx on public.profile_settings (suspended_until)
  where suspended_until is not null or banned_at is not null;

alter table public.moderation_actions add column profile_id uuid references public.profiles (id) on delete set null;
create index moderation_actions_profile_idx on public.moderation_actions (profile_id, created_at desc);

alter table public.reports add column reporter_standing boolean not null default false;

-- ---------------------------------------------------------------------------
-- Who a decision is about
-- ---------------------------------------------------------------------------

create function public.responsible_profile(p_target_type public.report_target, p_target_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select case p_target_type
    when 'profile' then p_target_id
    when 'post' then (select author_id from public.posts where id = p_target_id)
    when 'event' then (select host_id from public.events where id = p_target_id)
    when 'opportunity' then (select poster_id from public.opportunities where id = p_target_id)
    when 'message' then (select sender_id from public.messages where id = p_target_id)
    when 'space' then (select created_by from public.spaces where id = p_target_id)
  end
$$;

update public.moderation_actions a set profile_id = public.responsible_profile(a.target_type, a.target_id) where a.profile_id is null;

create or replace function public.record_moderation(p_action text, p_target_type public.report_target, p_target_id uuid, p_reason text, p_rule public.community_rule)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id bigint;
begin
  insert into public.moderation_actions (moderator_id, action, target_type, target_id, profile_id, reason, rule)
  values (auth.uid(), p_action, p_target_type, p_target_id, public.responsible_profile(p_target_type, p_target_id), nullif(left(trim(p_reason), 280), ''), p_rule)
  returning id into v_id;
  return v_id;
end;
$$;

-- Every decision with who made it and whom it was about. Row level security
-- on moderation_actions keeps it to moderators.
create view public.moderation_log
with (security_invoker = true)
as
select a.id, a.action, a.target_type, a.target_id, a.profile_id, a.reason, a.rule, a.created_at,
  public.profile_card(a.moderator_id) as moderator,
  public.profile_card(a.profile_id) as subject
from public.moderation_actions a;

-- ---------------------------------------------------------------------------
-- Identity hashes
-- ---------------------------------------------------------------------------

-- Set outside migrations: select vault.create_secret('<random>', 'identity_pepper').
-- Without it nothing is hashed, bans refuse, and deletion goes ahead unrecorded.
create function public.identity_pepper()
returns bytea
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_secret text;
begin
  begin
    select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'identity_pepper';
  exception when undefined_table or invalid_schema_name or insufficient_privilege then
    return null;
  end;
  return case when coalesce(v_secret, '') = '' then null else convert_to(v_secret, 'UTF8') end;
end;
$$;

-- One spelling per mailbox: lower case, no tag after "+", and no dots for
-- Gmail, where they are ignored.
create function public.normalise_email(p_email text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case when p_email is null or strpos(p_email, '@') = 0 then null else (
    with parts as (
      select split_part(lower(trim(p_email)), '@', 1) as local, split_part(lower(trim(p_email)), '@', 2) as domain
    )
    select case when domain in ('gmail.com', 'googlemail.com')
      then replace(split_part(local, '+', 1), '.', '') || '@gmail.com'
      else split_part(local, '+', 1) || '@' || domain end
    from parts
  ) end
$$;

create function public.identity_hash(p_identity text)
returns bytea
language sql
stable
security definer
set search_path = ''
as $$
  select extensions.hmac(convert_to(p_identity, 'UTF8'), public.identity_pepper(), 'sha256')
$$;

-- The identities behind a sign-up or an account, as Auth describes them:
-- the email address, and each outside provider's stable subject.
create function public.identity_keys(p_email text, p_identities jsonb)
returns setof text
language sql
immutable
set search_path = ''
as $$
  select 'email:' || public.normalise_email(p_email) where public.normalise_email(p_email) is not null
  union
  select (i ->> 'provider') || ':' || coalesce(i ->> 'provider_id', i -> 'identity_data' ->> 'sub', i ->> 'id')
  from jsonb_array_elements(coalesce(p_identities, '[]'::jsonb)) as i
  where jsonb_typeof(p_identities) = 'array'
    and coalesce(i ->> 'provider', 'email') <> 'email'
    and coalesce(i ->> 'provider_id', i -> 'identity_data' ->> 'sub', i ->> 'id') is not null
$$;

create function public.user_identity_keys(p_user uuid)
returns setof text
language sql
stable
security definer
set search_path = ''
as $$
  select public.identity_keys(
    (select u.email from auth.users u where u.id = p_user),
    (select coalesce(jsonb_agg(jsonb_build_object('provider', i.provider, 'provider_id', i.provider_id, 'identity_data', i.identity_data)), '[]'::jsonb)
     from auth.identities i where i.user_id = p_user)
  )
$$;

create table public.banned_identities (
  hash bytea primary key,
  rule public.community_rule not null,
  -- Null for a ban; a suspension's end when a suspended person deleted their account.
  until timestamptz,
  action_id bigint references public.moderation_actions (id) on delete set null,
  created_at timestamptz not null default now()
);

create index banned_identities_until_idx on public.banned_identities (until) where until is not null;
create index banned_identities_action_idx on public.banned_identities (action_id);

alter table public.banned_identities enable row level security;

create function public.remember_banned_identities(p_user uuid, p_rule public.community_rule, p_until timestamptz, p_action_id bigint)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  if public.identity_pepper() is null then
    return 0;
  end if;
  with written as (
    insert into public.banned_identities as b (hash, rule, until, action_id)
    select public.identity_hash(k), p_rule, p_until, p_action_id from public.user_identity_keys(p_user) as k
    on conflict (hash) do update set
      rule = excluded.rule,
      until = case when b.until is null or excluded.until is null then null else greatest(b.until, excluded.until) end,
      action_id = coalesce(excluded.action_id, b.action_id)
    returning 1
  )
  select count(*) into v_count from written;
  return v_count;
end;
$$;

create function public.forget_banned_identities(p_user uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.banned_identities b
  where public.identity_pepper() is not null
    and b.hash in (select public.identity_hash(k) from public.user_identity_keys(p_user) as k)
$$;

create function public.is_identity_banned(p_email text, p_identities jsonb)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.identity_pepper() is not null and exists (
    select 1 from public.banned_identities b
    where b.hash in (select public.identity_hash(k) from public.identity_keys(p_email, p_identities) as k)
      and (b.until is null or b.until > now())
  )
$$;

-- Hashes of ended suspensions are not kept.
create function public.prune_banned_identities()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  delete from public.banned_identities where until < now();
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create function public.banned_identity_count()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer from public.banned_identities where public.is_moderator() and (until is null or until > now())
$$;

-- Supabase Auth's "before user created" hook. The person does not exist in
-- the database yet, so this is the only place a sign-up can be refused with
-- a sentence rather than "Database error saving new user".
create function public.before_user_created(event jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.is_identity_banned(event -> 'user' ->> 'email', event -> 'user' -> 'identities') then
    return jsonb_build_object('error', jsonb_build_object(
      'http_code', 403,
      'message', 'An account using this email address or sign-in was banned from Mavuno, so a new one can''t be created. If you think that''s a mistake, email us at the address on mavuno.au/terms.'
    ));
  end if;
  return '{}'::jsonb;
end;
$$;

-- ---------------------------------------------------------------------------
-- Suspensions and bans
-- ---------------------------------------------------------------------------

create function public.duration_phrase(p_duration interval)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_duration < interval '1 day' then
      round(extract(epoch from p_duration) / 3600)::text || case when round(extract(epoch from p_duration) / 3600) = 1 then ' hour' else ' hours' end
    else
      round(extract(epoch from p_duration) / 86400)::text || case when round(extract(epoch from p_duration) / 86400) = 1 then ' day' else ' days' end
  end
$$;

create function public.notice_time(p_at timestamptz)
returns text
language sql
immutable
set search_path = ''
as $$
  select to_char(p_at at time zone 'Australia/Sydney', 'FMDy FMDD Mon YYYY, FMHH12:MI am') || ' (Sydney time)'
$$;

create function public.require_sanction_rights(p_profile_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_moderator();
  if not exists (select 1 from public.profiles where id = p_profile_id and account_type = 'person') then
    raise exception 'That account is not a person' using errcode = '23514';
  end if;
  if exists (select 1 from public.profile_settings where id = p_profile_id and site_role <> 'member') and not public.is_admin() then
    raise exception 'Only admins can suspend moderators' using errcode = '42501';
  end if;
end;
$$;

drop function public.moderate_suspend(uuid, integer, text, public.community_rule);

-- A second suspension adds to the first instead of replacing it, so a short
-- one can never cut a long one short. Lifting is a separate, explicit step.
create function public.moderate_suspend(p_profile_id uuid, p_duration interval, p_reason text default null, p_rule public.community_rule default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reason text := nullif(left(trim(p_reason), 280), '');
  v_until timestamptz;
  v_banned timestamptz;
  v_new timestamptz;
  v_action bigint;
begin
  perform public.require_sanction_rights(p_profile_id);
  if p_duration is null or p_duration < interval '1 hour' or p_duration > interval '3650 days' then
    raise exception 'Suspensions last from an hour to ten years' using errcode = '23514';
  end if;
  if p_rule is null or p_rule = 'age' then
    raise exception 'Choose the rule it breaks' using errcode = '23514';
  end if;

  select suspended_until, banned_at into v_until, v_banned from public.profile_settings where id = p_profile_id for update;
  if v_banned is not null then
    raise exception 'That account is already banned' using errcode = '23514';
  end if;
  v_new := greatest(coalesce(v_until, now()), now()) + p_duration;
  update public.profile_settings set suspended_until = v_new where id = p_profile_id;

  v_action := public.record_moderation('suspend', 'profile', p_profile_id, v_reason, p_rule);
  perform public.close_reports('profile', p_profile_id, 'actioned');
  perform public.notify_moderation(p_profile_id, null,
    case when v_until is not null and v_until > now()
      then 'Your suspension was extended by ' || public.duration_phrase(p_duration) || ', until ' || public.notice_time(v_new) || ', '
      else 'Your account is suspended for ' || public.duration_phrase(p_duration) || ', until ' || public.notice_time(v_new) || ', ' end
      || public.rule_phrase(p_rule) || '.' || coalesce(' Reason: ' || v_reason, ''),
    p_rule, v_action);
end;
$$;

-- Hides what a person published, as deactivate_for_age does, so lifting the
-- ban brings it back unchanged.
create function public.hide_published_content(p_profile_id uuid, p_note text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_post public.posts;
begin
  for v_post in
    select * from public.posts where author_id = p_profile_id and status = 'published' and deleted_at is null for update
  loop
    update public.posts set status = 'rejected', moderation_note = p_note where id = v_post.id;
    perform public.count_post(v_post, -1);
  end loop;
  update public.events set status = 'rejected', rejection_reason = p_note where host_id = p_profile_id and status = 'published';
  update public.opportunities set status = 'rejected', rejection_reason = p_note where poster_id = p_profile_id and status = 'published';
end;
$$;

create function public.restore_hidden_content(p_profile_id uuid, p_note text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_post_id uuid;
begin
  for v_post_id in
    select id from public.posts where author_id = p_profile_id and status = 'rejected' and moderation_note = p_note
  loop
    perform public.publish_post(v_post_id);
  end loop;
  update public.events set status = 'published', rejection_reason = null where host_id = p_profile_id and rejection_reason = p_note;
  update public.opportunities set status = 'published', rejection_reason = null where poster_id = p_profile_id and rejection_reason = p_note;
end;
$$;

create function public.moderate_ban(p_profile_id uuid, p_reason text default null, p_rule public.community_rule default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reason text := nullif(left(trim(p_reason), 280), '');
  v_action bigint;
begin
  perform public.require_sanction_rights(p_profile_id);
  if p_rule is null or p_rule = 'age' then
    raise exception 'Choose the rule it breaks' using errcode = '23514';
  end if;
  if public.identity_pepper() is null then
    raise exception 'Bans need the identity_pepper secret in Vault before they can be recorded' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.profile_settings where id = p_profile_id and banned_at is not null) then
    raise exception 'That account is already banned' using errcode = '23514';
  end if;

  update public.profile_settings set banned_at = now(), suspended_until = 'infinity' where id = p_profile_id;
  perform public.hide_published_content(p_profile_id, 'Account banned');
  delete from public.scheduled_posts where created_by = p_profile_id and submitted_at is null;

  v_action := public.record_moderation('ban', 'profile', p_profile_id, v_reason, p_rule);
  perform public.remember_banned_identities(p_profile_id, p_rule, null, v_action);
  perform public.close_reports('profile', p_profile_id, 'actioned');
  perform public.notify_moderation(p_profile_id, null,
    'Your account is banned from Mavuno ' || public.rule_phrase(p_rule) || '.' || coalesce(' Reason: ' || v_reason, '')
      || ' You can still download your information and delete your account.',
    p_rule, v_action);
end;
$$;

-- Ends a suspension or, for admins, a ban. Decisions stay on the record.
create function public.moderate_lift_suspension(p_profile_id uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reason text := nullif(left(trim(p_reason), 280), '');
  v_until timestamptz;
  v_banned timestamptz;
  v_action bigint;
begin
  perform public.require_sanction_rights(p_profile_id);
  select suspended_until, banned_at into v_until, v_banned from public.profile_settings where id = p_profile_id for update;

  if v_banned is not null then
    if not public.is_admin() then
      raise exception 'Only admins can lift a ban' using errcode = '42501';
    end if;
    update public.profile_settings set banned_at = null, suspended_until = null where id = p_profile_id;
    perform public.forget_banned_identities(p_profile_id);
    perform public.restore_hidden_content(p_profile_id, 'Account banned');
    v_action := public.record_moderation('unban', 'profile', p_profile_id, v_reason, null);
    perform public.notify_moderation(p_profile_id, null, 'Your account is active again, and what was hidden is back.' || coalesce(' ' || v_reason, ''), null, v_action);
  elsif v_until is not null and v_until > now() then
    update public.profile_settings set suspended_until = null where id = p_profile_id;
    v_action := public.record_moderation('unsuspend', 'profile', p_profile_id, v_reason, null);
    perform public.notify_moderation(p_profile_id, null, 'Your suspension was lifted. Your account is active again.' || coalesce(' ' || v_reason, ''), null, v_action);
  else
    raise exception 'That account is not suspended' using errcode = '23514';
  end if;
end;
$$;

-- After a successful appeal: the content a decision removed comes back, or
-- the suspension or ban it imposed ends. Removed messages were wiped and
-- removed spaces deleted, so those cannot come back.
create function public.moderate_restore(p_action_id bigint, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reason text := nullif(left(trim(p_reason), 280), '');
  v_decision public.moderation_actions;
  v_label text;
  v_profile uuid;
  v_action bigint;
begin
  perform public.require_moderator();
  select * into v_decision from public.moderation_actions where id = p_action_id;
  if v_decision.id is null then
    raise exception 'There is no decision %', p_action_id using errcode = 'P0002';
  end if;

  case v_decision.action
    when 'reject' then
      case v_decision.target_type
        when 'post' then
          select author_id into v_profile from public.posts where id = v_decision.target_id and status = 'rejected' and deleted_at is null;
          if v_profile is null then
            raise exception 'That post is no longer there to restore' using errcode = 'P0002';
          end if;
          perform public.publish_post(v_decision.target_id);
          v_label := 'post';
        when 'event' then
          update public.events set status = 'published', rejection_reason = null
          where id = v_decision.target_id and status = 'rejected' returning host_id into v_profile;
          v_label := 'event';
        when 'opportunity' then
          update public.opportunities set status = 'published', rejection_reason = null
          where id = v_decision.target_id and status = 'rejected' returning poster_id into v_profile;
          v_label := 'opportunity';
        else
          raise exception 'Removed messages and spaces cannot be restored' using errcode = '23514';
      end case;
      if v_profile is null then
        raise exception 'That % is no longer there to restore', v_decision.target_type using errcode = 'P0002';
      end if;
      v_action := public.record_moderation('restore', v_decision.target_type, v_decision.target_id, v_reason, null);
      perform public.notify_moderation(v_profile, case when v_decision.target_type = 'post' then v_decision.target_id end,
        'After another look, your ' || v_label || ' is back.' || coalesce(' ' || v_reason, ''), null, v_action);
    when 'suspend', 'ban' then
      perform public.moderate_lift_suspension(v_decision.target_id, v_reason);
    else
      raise exception 'Decision % did not remove or suspend anything', p_action_id using errcode = '23514';
  end case;
end;
$$;

-- Deleting the account doesn't end a suspension or a ban: the hashes stay
-- until it would have ended.
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_until timestamptz;
  v_banned timestamptz;
  v_rule public.community_rule;
begin
  if auth.uid() is null then
    raise exception 'Sign in first' using errcode = '42501';
  end if;
  select suspended_until, banned_at into v_until, v_banned from public.profile_settings where id = auth.uid();
  if v_banned is not null or (v_until is not null and v_until > now()) then
    select rule into v_rule from public.moderation_actions
    where profile_id = auth.uid() and action in ('suspend', 'ban') and rule is not null
    order by created_at desc limit 1;
    perform public.remember_banned_identities(auth.uid(), coalesce(v_rule, 'terms'), case when v_banned is null then v_until end, null);
  end if;
  delete from auth.users where id = auth.uid();
end;
$$;

-- ---------------------------------------------------------------------------
-- The rules before the first post
-- ---------------------------------------------------------------------------

create function public.accept_rules()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and account_type = 'person') then
    raise exception 'Sign in first' using errcode = '42501';
  end if;
  update public.profile_settings set rules_accepted_at = coalesce(rules_accepted_at, now()) where id = auth.uid();
end;
$$;

create function public.require_rules_accepted()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.created_by is not null and not exists (
    select 1 from public.profile_settings where id = new.created_by and rules_accepted_at is not null
  ) then
    raise exception 'Read and accept the community rules before you post' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger posts_require_rules before insert on public.posts
  for each row execute function public.require_rules_accepted();
create trigger events_require_rules before insert on public.events
  for each row execute function public.require_rules_accepted();
create trigger opportunities_require_rules before insert on public.opportunities
  for each row execute function public.require_rules_accepted();
create trigger scheduled_posts_require_rules before insert on public.scheduled_posts
  for each row execute function public.require_rules_accepted();

-- ---------------------------------------------------------------------------
-- Reports that carry weight
-- ---------------------------------------------------------------------------

create function public.reporter_has_standing(p_person uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    join public.profile_settings s on s.id = p.id
    where p.id = p_person and (
      s.site_role in ('moderator', 'admin')
      or (
        p.created_at < now() - interval '7 days'
        and (s.suspended_until is null or s.suspended_until < now())
        and s.banned_at is null
        and (
          exists (select 1 from public.posts where created_by = p_person and status = 'published' and deleted_at is null)
          or exists (select 1 from public.events where created_by = p_person and status = 'published')
          or exists (select 1 from public.opportunities where created_by = p_person and status = 'published')
        )
        and not exists (
          select 1 from public.reports r
          where r.reporter_id = p_person and r.status = 'dismissed' and r.resolved_at > now() - interval '30 days'
        )
      )
    )
  )
$$;

-- A report counts against someone's reputation when its reporter had
-- standing, or once a moderator acted on it.
create or replace function public.has_good_reputation(p_person uuid)
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
      and (r.reporter_standing or r.status = 'actioned')
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

create or replace function public.report_content(
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

  insert into public.reports (reporter_id, target_type, target_id, target_profile_id, reason, details, snapshot, contact, reporter_standing)
  values (auth.uid(), p_target_type, p_target_id, v_profile, p_reason, v_details, left(v_snapshot, 4000), v_contact, public.reporter_has_standing(auth.uid()))
  on conflict (reporter_id, target_type, target_id) do nothing;
  if not found then
    raise exception 'You already reported this' using errcode = '23505';
  end if;

  -- Three throwaway accounts must not be able to hide a post.
  if p_target_type = 'post' and (
    select count(distinct reporter_id) from public.reports
    where target_type = 'post' and target_id = p_target_id and status = 'open' and reporter_standing
  ) >= public.report_hold_threshold() then
    select * into v_post from public.posts where id = p_target_id and status = 'published' for update;
    if v_post.id is not null then
      update public.posts set status = 'pending', moderation_note = 'Held for review after reports' where id = p_target_id;
      perform public.count_post(v_post, -1);
    end if;
  end if;
end;
$$;

-- How many of a group's reports came from members with standing.
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
  min(r.created_at) filter (where r.reason::text = 'legal') + interval '7 days' as respond_by,
  count(*) filter (where r.reporter_standing)::integer as standing_count
from public.reports r
where r.status = 'open' and public.is_moderator()
group by r.target_type, r.target_id, r.target_profile_id;

-- ---------------------------------------------------------------------------
-- Schedules
-- ---------------------------------------------------------------------------

do $$
begin
  create extension if not exists pg_cron with schema pg_catalog;
  perform cron.schedule('mavuno-prune-banned-identities', '29 3 * * *', 'select public.prune_banned_identities()');
exception when others then
  raise notice 'pg_cron is not available (%), prune ended suspensions'' hashes with /api/maintenance', sqlerrm;
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

revoke all on table public.banned_identities from public, anon, authenticated;
grant all on table public.banned_identities to service_role;

revoke all on function
  public.responsible_profile(public.report_target, uuid),
  public.identity_pepper(),
  public.normalise_email(text),
  public.identity_hash(text),
  public.identity_keys(text, jsonb),
  public.user_identity_keys(uuid),
  public.remember_banned_identities(uuid, public.community_rule, timestamptz, bigint),
  public.forget_banned_identities(uuid),
  public.is_identity_banned(text, jsonb),
  public.prune_banned_identities(),
  public.before_user_created(jsonb),
  public.duration_phrase(interval),
  public.notice_time(timestamptz),
  public.require_sanction_rights(uuid),
  public.hide_published_content(uuid, text),
  public.restore_hidden_content(uuid, text),
  public.require_rules_accepted(),
  public.reporter_has_standing(uuid)
from public, anon, authenticated;

grant execute on function public.prune_banned_identities() to service_role;

-- Auth runs the hook as supabase_auth_admin, which a plain Postgres (the
-- database tests) does not have.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'supabase_auth_admin') then
    grant usage on schema public to supabase_auth_admin;
    grant execute on function public.before_user_created(jsonb) to supabase_auth_admin;
  end if;
end;
$$;

revoke all on function
  public.accept_rules(),
  public.banned_identity_count(),
  public.moderate_suspend(uuid, interval, text, public.community_rule),
  public.moderate_ban(uuid, text, public.community_rule),
  public.moderate_lift_suspension(uuid, text),
  public.moderate_restore(bigint, text)
from public, anon;

grant execute on function
  public.accept_rules(),
  public.banned_identity_count(),
  public.moderate_suspend(uuid, interval, text, public.community_rule),
  public.moderate_ban(uuid, text, public.community_rule),
  public.moderate_lift_suspension(uuid, text),
  public.moderate_restore(bigint, text)
to authenticated;

grant select on public.moderation_log to authenticated;
-- Moderators read reports column by column, never the reporter.
grant select (reporter_standing) on public.reports to authenticated;
