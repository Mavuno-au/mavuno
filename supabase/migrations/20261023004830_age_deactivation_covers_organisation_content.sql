-- An under-16 deactivation hid only what the person published as themselves,
-- so posts, events and opportunities they wrote as an organisation stayed up.
-- Hiding and restoring now go through the same functions as a ban, which
-- match created_by too. The note differs from a ban's, so lifting one never
-- brings back what the other hid.

create or replace function public.deactivate_for_age(p_profile_id uuid, p_step public.age_check_step, p_basis public.age_check_basis)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profile_settings s set age_deactivated_at = now()
  from public.profiles p
  where s.id = p_profile_id and p.id = s.id and p.account_type = 'person' and s.age_deactivated_at is null;
  if not found then
    return false;
  end if;

  perform public.hide_published_content(p_profile_id, 'Account deactivated');

  insert into public.age_checks (profile_id, step, basis, moderator_id)
  values (p_profile_id, p_step, p_basis, case when p_step = 'flagged' then auth.uid() end);
  return true;
end;
$$;

create or replace function public.moderate_reinstate_age(p_profile_id uuid, p_basis public.age_check_basis)
returns void
language plpgsql
security definer
set search_path = ''
as $$
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

  perform public.restore_hidden_content(p_profile_id, 'Account deactivated');

  insert into public.age_checks (profile_id, step, basis, moderator_id) values (p_profile_id, 'reinstated', p_basis, auth.uid());
  perform public.record_moderation('reinstate', 'profile', p_profile_id, null, 'age');
  perform public.notify_moderation(p_profile_id, null, 'Your account is active again. Thanks for confirming your age.', null, null);
end;
$$;
