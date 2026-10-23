-- Messaging gaps found in a full review on 23 October 2026.
--
-- 1. A block made after two people were in a group together did nothing
--    there: each still read the other's messages, which counted as unread
--    and showed as the group's last message.
-- 2. Declining a message request closed the conversation for good. Message
--    still showed on the profile, but the decliner's first message failed and
--    the conversation never came back to their list.
-- 3. Someone blocked in a direct conversation could still join its Realtime
--    channel and send typing, read and reaction pings on it.
-- 4. A message a moderator removed kept its link and link card.
-- 5. Removing a message with photos scanned every message for each photo.

-- ---------------------------------------------------------------------------
-- 1. Blocks reach group conversations
-- ---------------------------------------------------------------------------

-- The inbox's unread counts and last message read messages through this
-- policy too, so they leave out the blocked person as well.
alter policy "Participants read messages from when they joined" on public.messages
  using (created_at >= public.message_visible_from(conversation_id) and (sender_id is null or not public.is_blocked_with_viewer(sender_id)));

-- ---------------------------------------------------------------------------
-- 2. Opening a declined request again
-- ---------------------------------------------------------------------------

create or replace function public.start_direct_conversation(p_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
  v_key text;
  v_id uuid;
  v_status public.participant_status;
begin
  if not public.is_active_member() then
    raise exception 'Sign in to send messages' using errcode = '42501';
  end if;
  if p_user_id = v_me then
    raise exception 'You cannot message yourself' using errcode = '23514';
  end if;
  if public.is_blocked_between(v_me, p_user_id) then
    raise exception 'You cannot message this person' using errcode = '42501';
  end if;

  v_key := least(v_me::text, p_user_id::text) || ':' || greatest(v_me::text, p_user_id::text);
  select id into v_id from public.conversations where direct_key = v_key;
  if v_id is not null then
    -- A request to the caller becomes accepted when they open it this way.
    -- One they declined opens afresh, without the request they turned down.
    update public.conversation_participants
    set status = 'accepted',
        visible_from = case when status = 'declined' then now() else visible_from end
    where conversation_id = v_id and user_id = v_me and status in ('pending', 'declined');
    return v_id;
  end if;

  v_status := public.initial_participant_status(v_me, p_user_id);
  if v_status = 'pending' and (
    select count(*) from public.conversations
    where created_by = v_me and kind = 'direct' and created_at > now() - interval '1 day'
  ) >= 20 then
    raise exception 'You have sent a lot of message requests today. Try again tomorrow.' using errcode = '23514';
  end if;

  insert into public.conversations (kind, direct_key, created_by) values ('direct', v_key, v_me) returning id into v_id;
  insert into public.conversation_participants (conversation_id, user_id, status)
  values (v_id, v_me, 'accepted'), (v_id, p_user_id, v_status);
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Realtime channels follow what each person may read
-- ---------------------------------------------------------------------------

create or replace function public.realtime_topic_allowed(p_topic text, p_extension text, p_send boolean)
returns boolean
language sql
stable
set search_path = ''
as $$
  select case
    when p_topic like 'conversation:%' then
      p_extension = 'broadcast'
      and public.message_visible_from(public.try_uuid(substr(p_topic, 14))) is not null
      and (not p_send or (public.is_active_member() and public.is_accepted_participant(public.try_uuid(substr(p_topic, 14)))))
    when p_topic in ('inbox:' || auth.uid(), 'counts:' || auth.uid()) then not p_send
    else false
  end
$$;

-- ---------------------------------------------------------------------------
-- 4. A removed message keeps nothing it said
-- ---------------------------------------------------------------------------

create or replace function public.clear_removed_message_alts()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.image_alts := '{}';
  new.link_url := null;
  new.link_preview := null;
  return new;
end;
$$;

update public.messages set link_url = null, link_preview = null where removed_at is not null and (link_url is not null or link_preview is not null);

-- ---------------------------------------------------------------------------
-- 5. A photo's path starts with its conversation
-- ---------------------------------------------------------------------------

create or replace function public.queue_message_media()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.storage_cleanup (bucket, path)
  select 'message-media', path from unnest(old.image_paths) as path
  where (tg_op = 'DELETE' or not (path = any (new.image_paths)))
    and not exists (
      select 1 from public.messages m
      where m.conversation_id = old.conversation_id and m.id <> old.id and path = any (m.image_paths)
    )
  on conflict do nothing;
  return null;
end;
$$;
