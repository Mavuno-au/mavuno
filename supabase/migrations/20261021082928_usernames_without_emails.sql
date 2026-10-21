-- Usernames are public, so they must never carry someone's email address.
-- Browsers offered to autofill the sign-up username with the email, and the
-- form turned "name@gmail.com" into a valid-looking "namegmail_com". This
-- refuses usernames that name an email provider or the person's own email
-- domain; a sign-up that tries one gets a neutral member_ username instead.

create function public.username_reveals_email(p_username text, p_email text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  with parts as (
    select
      replace(lower(coalesce(p_username, '')), '_', '') as name,
      lower(split_part(split_part(coalesce(p_email, ''), '@', 2), '.', 1)) as domain
  )
  select name ~ '(gmail|googlemail|yahoo|hotmail|outlook|icloud|bigpond|optusnet|protonmail)'
    or (length(domain) >= 4 and position(domain in name) > 0)
  from parts
$$;

create function public.guard_username_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.account_type = 'person'
     and (tg_op = 'INSERT' or new.username is distinct from old.username)
     and public.username_reveals_email(new.username, (select email from auth.users where id = new.id)) then
    raise exception 'Usernames are public, so they can''t include your email address.' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger profiles_username_email before insert or update of username on public.profiles
  for each row execute function public.guard_username_email();

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
     or exists (select 1 from public.profiles where username = v_username)
     or public.username_reveals_email(v_username, new.email) then
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

revoke all on function public.username_reveals_email(text, text), public.guard_username_email() from public, anon, authenticated;
