-- A username someone typed at sign-up that another account took moments
-- earlier was silently swapped for member_<id>, and the person only found out
-- from their profile address. The sign-up form checks for taken and reserved
-- names first, so reaching this trigger with a taken one means two people
-- chose it at once: stop the sign-up so the form can say so. Accounts without
-- a chosen name (Google) and names the form would refuse keep the generated
-- fallback.
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
  v_valid boolean;
begin
  v_valid := v_username ~ '^[a-z0-9_]{3,30}$'
    and not public.is_reserved_username(v_username)
    and not public.username_reveals_email(v_username, new.email);

  if v_valid and exists (select 1 from public.profiles where username = v_username) then
    raise exception 'That username is taken' using errcode = '23505';
  end if;
  if not v_valid then
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
