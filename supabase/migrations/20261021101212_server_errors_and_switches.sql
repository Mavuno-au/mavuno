-- Failing loudly, and pausing without a deploy.
--
-- server_errors keeps what went wrong on the server: one row per error and
-- route, with a count, written by the app's instrumentation through the
-- service role. It never holds a request, a cookie or anything about a person,
-- and rows are pruned after 14 days. Three switches in site_settings pause the
-- automatic check, link cards and photo uploads. Tasks queued while their
-- switch is off wait, so nothing is skipped, and run when it is turned back on.
-- admin_health() reports failed and held tasks, recent errors and the switches.

-- ---------------------------------------------------------------------------
-- Switches
-- ---------------------------------------------------------------------------

alter table public.site_settings
  add column automatic_check boolean not null default true,
  add column link_previews boolean not null default true,
  add column uploads boolean not null default true;

create function public.admin_update_switches(p_automatic_check boolean, p_link_previews boolean, p_uploads boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Admins only' using errcode = '42501';
  end if;
  update public.site_settings
  set automatic_check = coalesce(p_automatic_check, automatic_check),
      link_previews = coalesce(p_link_previews, link_previews),
      uploads = coalesce(p_uploads, uploads),
      updated_at = now();
end;
$$;

-- Whether tasks of this kind may run right now.
create function public.background_task_enabled(p_kind text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case p_kind
    when 'automatic_check' then s.automatic_check
    when 'link_preview' then s.link_previews
    else true
  end
  from public.site_settings s
$$;

-- As before, but a task whose switch is off is left in the queue untouched:
-- its attempts and run_after stay as they are until it is allowed to run.
create or replace function public.claim_background_tasks(p_limit integer default 10, p_target_id uuid default null)
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
      and public.background_task_enabled(t.kind)
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

-- Held tasks are not work that is due, so they don't wake the runner either.
create or replace function public.wake_background_tasks()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
  v_secret text;
begin
  if not exists (
    select 1 from public.background_tasks
    where failed_at is null and run_after <= now() and public.background_task_enabled(kind)
  ) then
    return false;
  end if;
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'background_tasks_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'background_tasks_secret';
  if v_url is null or v_secret is null then
    return false;
  end if;
  perform net.http_get(
    url := v_url,
    headers := jsonb_build_object('Authorization', 'Bearer ' || v_secret),
    timeout_milliseconds := 60000
  );
  return true;
end;
$$;

-- ---------------------------------------------------------------------------
-- Server errors
-- ---------------------------------------------------------------------------

create table public.server_errors (
  id bigint generated always as identity primary key,
  -- Next.js's hash of the error, the same one the person sees on the error page.
  digest text not null check (char_length(digest) between 1 and 64),
  -- The route pattern (/u/[username]), never the address that was asked for.
  route text not null check (char_length(route) between 1 and 200),
  kind text not null check (kind in ('render', 'route', 'action', 'proxy')),
  message text not null check (char_length(message) between 1 and 300),
  count integer not null default 1 check (count > 0),
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  unique (digest, route)
);

create index server_errors_last_seen_idx on public.server_errors (last_seen);

alter table public.server_errors enable row level security;

create function public.prune_server_errors()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  delete from public.server_errors where last_seen < now() - interval '14 days';
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- The same error on the same route counts up rather than adding rows, so a
-- loop can't fill the table. Pruning here as well as daily keeps the promise
-- even where pg_cron is missing.
create function public.record_server_error(p_digest text, p_route text, p_kind text, p_message text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.server_errors (digest, route, kind, message)
  values (
    left(coalesce(nullif(trim(p_digest), ''), 'unknown'), 64),
    left(coalesce(nullif(trim(p_route), ''), 'unknown'), 200),
    case when p_kind in ('render', 'route', 'action', 'proxy') then p_kind else 'render' end,
    left(coalesce(nullif(trim(p_message), ''), 'Error'), 300)
  )
  on conflict (digest, route) do update
    set count = public.server_errors.count + 1,
        last_seen = now(),
        kind = excluded.kind,
        message = excluded.message;
  perform public.prune_server_errors();
end;
$$;

do $$
begin
  create extension if not exists pg_cron with schema pg_catalog;
  perform cron.schedule('mavuno-prune-server-errors', '47 3 * * *', 'select public.prune_server_errors()');
exception when others then
  raise notice 'pg_cron is not available (%); server errors are pruned as new ones are recorded', sqlerrm;
end;
$$;

-- ---------------------------------------------------------------------------
-- Health
-- ---------------------------------------------------------------------------

-- As before, plus background tasks (failed, held by a switch, or due and not
-- picked up), the last day's server errors and the switches.
create or replace function public.admin_health()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Only admins can see service health' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'checkedAt', now(),
    'openReports', (select count(*) from public.reports where status = 'open'),
    'oldestOpenReport', (select min(created_at) from public.reports where status = 'open'),
    'awaitingReview', (
      (select count(*) from public.posts where status = 'pending' and deleted_at is null)
      + (select count(*) from public.events where status = 'pending')
      + (select count(*) from public.opportunities where status = 'pending')
    ),
    'oldestAwaitingReview', (select min(created_at) from public.posts where status = 'pending' and deleted_at is null),
    'suspended', (select count(*) from public.profile_settings where suspended_until > now()),
    -- Deleted posts are erased within a minute by pg_cron; anything older
    -- than five minutes means the job has stopped.
    'purgeBacklog', (select count(*) from public.deleted_post_contents where deleted_at < now() - interval '5 minutes'),
    'storageBacklog', (select count(*) from public.storage_cleanup where created_at < now() - interval '1 day'),
    -- Scheduled posts go out within a minute of their time.
    'overdueScheduled', (
      select count(*) from public.scheduled_posts where submitted_at is null and scheduled_at < now() - interval '5 minutes'
    ),
    'oldestOverdueScheduled', (
      select min(scheduled_at) from public.scheduled_posts where submitted_at is null and scheduled_at < now() - interval '5 minutes'
    ),
    -- Accounts deactivated for being under 16 are deleted after 30 days by a
    -- daily job, so one still here a day after that means the job has stopped.
    'ageDeactivated', (select count(*) from public.profile_settings where age_deactivated_at is not null),
    'agePurgeOverdue', (
      select count(*) from public.profile_settings where age_deactivated_at < now() - interval '31 days'
    ),
    'nextAgePurge', (
      select min(age_deactivated_at) + interval '30 days' from public.profile_settings where age_deactivated_at is not null
    ),
    'cron', public.cron_health(),
    -- Tasks run within a couple of minutes of coming due; one waiting a
    -- quarter of an hour means nothing is draining the queue.
    'tasks', jsonb_build_object(
      'failed', (select count(*) from public.background_tasks where failed_at is not null),
      'held', (select count(*) from public.background_tasks where failed_at is null and not public.background_task_enabled(kind)),
      'overdue', (
        select count(*) from public.background_tasks
        where failed_at is null and run_after < now() - interval '15 minutes' and public.background_task_enabled(kind)
      ),
      'failures', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'kind', f.kind, 'targetType', f.target_type, 'attempts', f.attempts, 'error', f.last_error, 'failedAt', f.failed_at
        ) order by f.failed_at desc), '[]'::jsonb)
        from (select * from public.background_tasks where failed_at is not null order by failed_at desc limit 10) f
      )
    ),
    'errors', jsonb_build_object(
      'lastDay', (select count(*) from public.server_errors where last_seen > now() - interval '1 day'),
      'recent', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'digest', e.digest, 'route', e.route, 'kind', e.kind, 'message', e.message, 'count', e.count, 'firstSeen', e.first_seen, 'lastSeen', e.last_seen
        ) order by e.last_seen desc), '[]'::jsonb)
        from (select * from public.server_errors order by last_seen desc limit 10) e
      )
    ),
    'switches', (
      select jsonb_build_object(
        'premoderation', s.premoderation, 'translations', s.translations,
        'automaticCheck', s.automatic_check, 'linkPreviews', s.link_previews, 'uploads', s.uploads
      )
      from public.site_settings s
    ),
    'lastDay', jsonb_build_object(
      'signups', (select count(*) from public.profiles where account_type = 'person' and created_at > now() - interval '1 day'),
      'posts', (select count(*) from public.posts where status = 'published' and deleted_at is null and created_at > now() - interval '1 day'),
      'messages', (select count(*) from public.messages where removed_at is null and created_at > now() - interval '1 day'),
      'reports', (select count(*) from public.reports where created_at > now() - interval '1 day')
    )
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

revoke all on table public.server_errors from public, anon, authenticated;
grant all on table public.server_errors to service_role;

revoke all on function
  public.admin_update_switches(boolean, boolean, boolean),
  public.background_task_enabled(text),
  public.prune_server_errors(),
  public.record_server_error(text, text, text, text)
from public, anon, authenticated;

grant execute on function public.admin_update_switches(boolean, boolean, boolean) to authenticated;
grant execute on function public.record_server_error(text, text, text, text) to service_role;
grant execute on function public.prune_server_errors() to service_role;
