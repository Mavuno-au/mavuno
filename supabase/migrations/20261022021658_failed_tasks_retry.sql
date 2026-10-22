-- Background tasks that gave up stay listed on the Health tab for a week,
-- and a post whose automatic check gave up is never checked. Admins can now
-- try them all again, which the database's next wake-up picks up, or dismiss
-- them once they've looked.

create function public.admin_settle_failed_tasks(p_retry boolean)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  if not public.is_admin() then
    raise exception 'Admins only' using errcode = '42501';
  end if;
  if p_retry then
    update public.background_tasks
    set failed_at = null, attempts = 0, run_after = now(), last_error = null
    where failed_at is not null;
  else
    delete from public.background_tasks where failed_at is not null;
  end if;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.admin_settle_failed_tasks(boolean) from public, anon;
grant execute on function public.admin_settle_failed_tasks(boolean) to authenticated;
