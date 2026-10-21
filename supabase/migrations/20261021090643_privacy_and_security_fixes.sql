-- Privacy and security fixes:
--   1. Realtime channels are private: only a conversation's participants can
--      join its channel, and reactions no longer stream from the table.
--   2. Reactions are emoji from a fixed list, at most 60 a minute.
--   3. Photos sent in messages are erased with the message, the conversation
--      or the account that sent them.
--   4. Avatars, banners and event covers can only be this project's Storage
--      files (or the Google profile photo a member signed up with).
--   5. pg_cron's run history is kept for 7 days.

-- ---------------------------------------------------------------------------
-- 1. Realtime
-- ---------------------------------------------------------------------------

-- Realtime can't apply row level security to deleted rows, so every
-- subscriber would receive every removed reaction. The thread re-reads
-- reactions when a participant announces a change on the private channel.
do $$
begin
  if exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'message_reactions') then
    alter publication supabase_realtime drop table public.message_reactions;
  end if;
end;
$$;

-- Channels the app opens with `private: true`:
--   conversation:{id}  typing, read and reaction pings; participants receive,
--                      accepted participants send
--   inbox:{uid}, counts:{uid}  table changes for one member; only they join
create function public.realtime_topic_allowed(p_topic text, p_extension text, p_send boolean)
returns boolean
language sql
stable
set search_path = ''
as $$
  select case
    when p_topic like 'conversation:%' then
      p_extension = 'broadcast'
      and case
        when p_send then public.is_accepted_participant(public.try_uuid(substr(p_topic, 14)))
        else public.is_participant(public.try_uuid(substr(p_topic, 14)))
      end
    when p_topic in ('inbox:' || auth.uid(), 'counts:' || auth.uid()) then not p_send
    else false
  end
$$;

create policy "Members join their own channels" on realtime.messages for select to authenticated
  using (public.realtime_topic_allowed((select realtime.topic()), extension, false));

create policy "Participants send to their conversations" on realtime.messages for insert to authenticated
  with check (public.realtime_topic_allowed((select realtime.topic()), extension, true));

-- ---------------------------------------------------------------------------
-- 2. Reactions
-- ---------------------------------------------------------------------------

-- Text in a reaction would show to everyone in the conversation, so only
-- emoji from this list are accepted, with or without the emoji variation
-- selector, and hand gestures in any skin tone.
create function public.is_reaction_emoji(p_emoji text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  with plain as (select replace(p_emoji, U&'\FE0F', '') as emoji)
  select emoji = any (array[
      '❤', '😂', '👍', '🙏', '🔥', '😮', '😢', '😭', '😡', '🎉', '👏', '💯', '🙌', '😍', '🥰', '😊',
      '😅', '🤣', '🤔', '👀', '✅', '💪', '🤝', '✨', '🥳', '😎', '🙂', '😉', '😁', '😆', '💚', '💛',
      '🧡', '💜', '🖤', '🤍', '💙', '👌', '✊', '👋', '🌍', '🌺', '🎶', '☕', '🙄', '😴', '🤗', '😇',
      '🫶', '👎'
    ])
    or (
      char_length(emoji) = 2
      and left(emoji, 1) = any (array['👍', '👎', '🙏', '👏', '🙌', '💪', '🤝', '👌', '✊', '👋', '🫶'])
      and right(emoji, 1) between U&'\+01F3FB' and U&'\+01F3FF'
    )
  from plain
$$;

-- One row per member: reactions added in the current one-minute window.
-- Removing a reaction doesn't give one back, so toggling can't flood a
-- conversation with pings either.
create table public.reaction_rate (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  window_start timestamptz not null default now(),
  reactions integer not null default 1
);

alter table public.reaction_rate enable row level security;

create or replace function public.limit_reactions()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  if not public.is_reaction_emoji(new.emoji) then
    raise exception 'That reaction isn''t available' using errcode = '23514';
  end if;

  if (select count(*) from public.message_reactions where message_id = new.message_id and user_id = new.user_id) >= 12 then
    raise exception 'You can add up to 12 reactions to a message' using errcode = '23514';
  end if;

  insert into public.reaction_rate as r (user_id) values (new.user_id)
  on conflict (user_id) do update set
    window_start = case when r.window_start < now() - interval '1 minute' then now() else r.window_start end,
    reactions = case when r.window_start < now() - interval '1 minute' then 1 else r.reactions + 1 end
  returning reactions into v_count;
  if v_count > 60 then
    raise exception 'You''re reacting very quickly. Wait a minute and try again.' using errcode = '23514';
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Message photos
-- ---------------------------------------------------------------------------

-- Deleting a conversation or an account deletes its messages by cascade, and
-- moderators remove a message by clearing image_paths. Either way the files
-- are queued for /api/maintenance, which removes them from Storage.
create function public.queue_message_media()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    insert into public.storage_cleanup (bucket, path)
    select 'message-media', path from unnest(old.image_paths) as path
    on conflict do nothing;
  else
    insert into public.storage_cleanup (bucket, path)
    select 'message-media', path from unnest(old.image_paths) as path
    where not (path = any (new.image_paths))
    on conflict do nothing;
  end if;
  return null;
end;
$$;

create trigger messages_queue_media_on_delete after delete on public.messages
  for each row when (cardinality(old.image_paths) > 0) execute function public.queue_message_media();

create trigger messages_queue_media_on_update after update of image_paths on public.messages
  for each row when (old.image_paths is distinct from new.image_paths) execute function public.queue_message_media();

-- Files already left behind: photos of messages that were removed or deleted
-- before this migration, and uploads older than a day that were never sent.
insert into public.storage_cleanup (bucket, path)
select 'message-media', o.name
from storage.objects o
where o.bucket_id = 'message-media'
  and o.created_at < now() - interval '1 day'
  and not exists (select 1 from public.messages m where o.name = any (m.image_paths))
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- 4. Profile and event images
-- ---------------------------------------------------------------------------

-- An image URL is fetched by everyone who views it, so one pointing anywhere
-- else would tell that host who looked. The app writes only public URLs of
-- this project's Storage; add a row here for another project or a local stack.
create table public.storage_origins (
  origin text primary key check (origin ~ '^https?://[A-Za-z0-9.-]+(:[0-9]+)?$')
);

alter table public.storage_origins enable row level security;

insert into public.storage_origins (origin) values
  ('https://hposvtbqckeyyxtjzyas.supabase.co'),
  ('http://127.0.0.1:54321');

-- {origin}/storage/v1/object/public/media/{owner}/{folder}/{file}, as the
-- upload route stores them.
create function public.is_stored_image(p_url text, p_owner uuid, p_folder text)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.storage_origins o
    cross join lateral (select o.origin || '/storage/v1/object/public/media/' || p_owner::text || '/' || p_folder || '/' as prefix) x
    where starts_with(p_url, x.prefix) and substr(p_url, char_length(x.prefix) + 1) ~ '^[A-Za-z0-9._-]+$'
  )
$$;

-- Only changed values are checked, so a profile saved with an older image
-- keeps working. A sign-up's provider photo from another host is dropped
-- rather than failing the sign-up.
create function public.check_profile_images()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.avatar_url is not null
     and (tg_op = 'INSERT' or new.avatar_url is distinct from old.avatar_url)
     and not public.is_stored_image(new.avatar_url, new.id, 'avatars')
     and new.avatar_url !~ '^https://lh[0-9]+\.googleusercontent\.com/[^\s]+$' then
    if tg_op = 'INSERT' then
      new.avatar_url := null;
    else
      raise exception 'Upload the profile photo again' using errcode = '23514';
    end if;
  end if;

  if new.banner_url is not null
     and (tg_op = 'INSERT' or new.banner_url is distinct from old.banner_url)
     and not public.is_stored_image(new.banner_url, new.id, 'banners') then
    raise exception 'Upload the banner again' using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger profiles_check_images before insert or update of avatar_url, banner_url on public.profiles
  for each row execute function public.check_profile_images();

create function public.check_event_cover()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.cover_url is not null
     and (tg_op = 'INSERT' or new.cover_url is distinct from old.cover_url)
     and not public.is_stored_image(new.cover_url, new.host_id, 'events') then
    raise exception 'Upload the cover image again' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger events_check_cover before insert or update of cover_url on public.events
  for each row execute function public.check_event_cover();

-- ---------------------------------------------------------------------------
-- 5. pg_cron history
-- ---------------------------------------------------------------------------

-- pg_cron records every run and never deletes them; with jobs every minute
-- that is thousands of rows a day.
create function public.prune_cron_history()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  if to_regclass('cron.job_run_details') is null then
    return 0;
  end if;
  execute 'delete from cron.job_run_details where start_time < now() - interval ''7 days''';
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

do $$
begin
  create extension if not exists pg_cron with schema pg_catalog;
  perform cron.schedule('mavuno-prune-cron-history', '41 3 * * *', 'select public.prune_cron_history()');
exception when others then
  raise notice 'pg_cron is not available (%), nothing to prune', sqlerrm;
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

revoke all on table public.reaction_rate, public.storage_origins from public, anon, authenticated;
grant select, insert, update, delete on table public.reaction_rate, public.storage_origins to service_role;

revoke all on function
  public.realtime_topic_allowed(text, text, boolean),
  public.is_reaction_emoji(text),
  public.queue_message_media(),
  public.is_stored_image(text, uuid, text),
  public.check_profile_images(),
  public.check_event_cover(),
  public.prune_cron_history()
from public, anon, authenticated;

-- The realtime.messages policies run as the member joining a channel.
grant execute on function public.realtime_topic_allowed(text, text, boolean) to authenticated;
