-- Erase deleted posts once their 30-second undo window has passed. Uses
-- pg_cron where it is available (Supabase has it; enable it under Database →
-- Extensions if this migration reports it missing). Without it, the
-- /api/maintenance route can run public.purge_deleted_posts() on a schedule.

do $$
begin
  create extension if not exists pg_cron with schema pg_catalog;
  perform cron.schedule('mavuno-purge-deleted-posts', '* * * * *', 'select public.purge_deleted_posts()');
exception when others then
  raise notice 'pg_cron is not available (%), schedule /api/maintenance instead', sqlerrm;
end;
$$;
