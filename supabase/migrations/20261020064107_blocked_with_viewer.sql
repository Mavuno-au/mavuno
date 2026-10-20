-- Which of the given profiles are on either side of a block with the viewer,
-- so lists of people (followers, following) can leave them out. Blocks are
-- otherwise only visible to the person who made them.
create function public.blocked_with_viewer(p_profile_ids uuid[])
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select id from unnest(p_profile_ids[1:200]) as id where public.is_blocked_with_viewer(id)
$$;

revoke all on function public.blocked_with_viewer(uuid[]) from public, anon;
grant execute on function public.blocked_with_viewer(uuid[]) to authenticated;
