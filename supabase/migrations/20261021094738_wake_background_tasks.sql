-- Background tasks (link cards, automatic checks) run straight after the
-- request that queued them, and Vercel's cron only runs once a day. This
-- closes the gap without spending much: every two minutes the database looks
-- for due tasks with one indexed lookup, and only when there are some does it
-- call /api/tasks over pg_net with TASKS_SECRET. With nothing due, no request leaves the
-- database. The address and its bearer secret live in Vault (names below),
-- set outside migrations; without them this does nothing.

do $$
begin
  create extension if not exists pg_net with schema extensions;
exception when others then
  raise notice 'pg_net is not available (%); background tasks wait for the daily cron', sqlerrm;
end;
$$;

create function public.wake_background_tasks()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
  v_secret text;
begin
  if not exists (select 1 from public.background_tasks where failed_at is null and run_after <= now()) then
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

revoke all on function public.wake_background_tasks() from public, anon, authenticated;

do $$
begin
  create extension if not exists pg_cron with schema pg_catalog;
  perform cron.schedule('mavuno-wake-background-tasks', '*/2 * * * *', 'select public.wake_background_tasks()');
exception when others then
  raise notice 'pg_cron is not available (%); background tasks wait for the daily cron', sqlerrm;
end;
$$;
