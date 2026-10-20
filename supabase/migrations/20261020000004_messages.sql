-- Private one-to-one conversations and group chats.
--
-- Contact rules (profile_settings.dm_policy):
--   everyone   anyone can write; people the recipient doesn't follow land in
--              Requests, and can send one message until it is accepted
--   following  only people the recipient follows
--   nobody     no new conversations (existing ones keep working)
-- Declined requests stay declined, so they cannot be repeated. Messages cannot
-- be edited; moderators can remove a reported one.

create type public.conversation_kind as enum ('direct', 'group');
create type public.participant_status as enum ('accepted', 'pending', 'declined');
create type public.participant_role as enum ('owner', 'admin', 'member');

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  kind public.conversation_kind not null,
  title text check (char_length(title) <= 60),
  direct_key text unique,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  last_message_at timestamptz,
  check ((kind = 'direct') = (direct_key is not null))
);

create table public.conversation_participants (
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role public.participant_role not null default 'member',
  status public.participant_status not null default 'accepted',
  last_read_at timestamptz not null default now(),
  archived_at timestamptz,
  muted boolean not null default false,
  joined_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);

create index conversation_participants_user_idx on public.conversation_participants (user_id, status);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  sender_id uuid references public.profiles (id) on delete cascade,
  body text not null default '' check (char_length(body) <= 2000),
  image_paths text[] not null default '{}' check (cardinality(image_paths) <= 3),
  reply_to_id uuid references public.messages (id) on delete set null,
  removed_at timestamptz,
  created_at timestamptz not null default now(),
  check (removed_at is not null or char_length(body) > 0 or cardinality(image_paths) > 0)
);

create index messages_conversation_idx on public.messages (conversation_id, created_at desc);
create index messages_sender_idx on public.messages (sender_id, created_at desc);

create table public.message_reactions (
  message_id uuid not null references public.messages (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  emoji text not null check (char_length(emoji) between 1 and 16),
  created_at timestamptz not null default now(),
  primary key (message_id, user_id, emoji)
);

alter table public.conversations enable row level security;
alter table public.conversation_participants enable row level security;
alter table public.messages enable row level security;
alter table public.message_reactions enable row level security;

create function public.is_participant(p_conversation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.conversation_participants
    where conversation_id = p_conversation_id and user_id = auth.uid() and status <> 'declined'
  )
$$;

create function public.is_accepted_participant(p_conversation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.conversation_participants
    where conversation_id = p_conversation_id and user_id = auth.uid() and status = 'accepted'
  )
$$;

create policy "Participants see conversations" on public.conversations for select to authenticated
  using (public.is_participant(id));
create policy "Participants see each other" on public.conversation_participants for select to authenticated
  using (public.is_participant(conversation_id));
create policy "Participants read messages" on public.messages for select to authenticated
  using (public.is_participant(conversation_id));
create policy "Participants see reactions" on public.message_reactions for select to authenticated
  using (exists (select 1 from public.messages m where m.id = message_id and public.is_participant(m.conversation_id)));

revoke insert, update, delete on public.conversations, public.conversation_participants, public.messages
  from anon, authenticated;

grant update (last_read_at, archived_at, muted) on public.conversation_participants to authenticated;
create policy "People update their own participation" on public.conversation_participants for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

grant insert (conversation_id, sender_id, body, image_paths, reply_to_id) on public.messages to authenticated;
create policy "Accepted participants send messages" on public.messages for insert to authenticated
  with check (sender_id = auth.uid() and public.is_accepted_participant(conversation_id) and public.is_active_member());

create policy "Participants react" on public.message_reactions for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (select 1 from public.messages m where m.id = message_id and m.removed_at is null and public.is_accepted_participant(m.conversation_id))
  );
create policy "People remove their reactions" on public.message_reactions for delete to authenticated
  using (user_id = auth.uid());

-- Up to 12 different reactions per person per message.
create function public.limit_reactions()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select count(*) from public.message_reactions where message_id = new.message_id and user_id = new.user_id) >= 12 then
    raise exception 'You can add up to 12 reactions to a message' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger message_reactions_limit before insert on public.message_reactions
  for each row execute function public.limit_reactions();

create function public.check_message()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_kind public.conversation_kind;
  v_path text;
begin
  select kind into v_kind from public.conversations where id = new.conversation_id;

  if v_kind = 'direct' then
    if exists (
      select 1 from public.conversation_participants cp
      where cp.conversation_id = new.conversation_id and cp.user_id <> new.sender_id
        and public.is_blocked_between(cp.user_id, new.sender_id)
    ) then
      raise exception 'You cannot message this person' using errcode = '42501';
    end if;
    -- While a request waits, the sender gets one message.
    if exists (
      select 1 from public.conversation_participants cp
      where cp.conversation_id = new.conversation_id and cp.user_id <> new.sender_id and cp.status = 'pending'
    ) and exists (select 1 from public.messages where conversation_id = new.conversation_id and sender_id = new.sender_id) then
      raise exception 'Your request is waiting to be accepted' using errcode = '23514';
    end if;
  end if;

  foreach v_path in array new.image_paths loop
    if split_part(v_path, '/', 1) <> new.conversation_id::text then
      raise exception 'Invalid attachment' using errcode = '42501';
    end if;
  end loop;

  if new.reply_to_id is not null and not exists (
    select 1 from public.messages where id = new.reply_to_id and conversation_id = new.conversation_id
  ) then
    new.reply_to_id := null;
  end if;

  if (select count(*) from public.messages where sender_id = new.sender_id and created_at > now() - interval '1 minute') >= 30 then
    raise exception 'Slow down a little: you are sending messages very quickly' using errcode = '23514';
  end if;

  new.body := trim(new.body);
  new.created_at := now();
  return new;
end;
$$;

create trigger messages_check before insert on public.messages
  for each row execute function public.check_message();

create function public.handle_new_message()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.conversations set last_message_at = new.created_at where id = new.conversation_id;
  update public.conversation_participants set last_read_at = new.created_at
  where conversation_id = new.conversation_id and user_id = new.sender_id;
  -- Any new message brings an archived conversation back.
  update public.conversation_participants set archived_at = null
  where conversation_id = new.conversation_id and archived_at is not null;
  return new;
end;
$$;

create trigger messages_handle_new after insert on public.messages
  for each row execute function public.handle_new_message();

-- ---------------------------------------------------------------------------
-- Starting and managing conversations
-- ---------------------------------------------------------------------------

-- Whether p_sender may start a conversation with p_recipient, and whether it
-- arrives directly ('accepted') or as a request ('pending').
create function public.initial_participant_status(p_sender uuid, p_recipient uuid)
returns public.participant_status
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_policy public.dm_policy;
  v_follows boolean;
begin
  select s.dm_policy into v_policy
  from public.profiles p join public.profile_settings s on s.id = p.id
  where p.id = p_recipient and p.account_type = 'person';

  if v_policy is null then
    raise exception 'You can only message people' using errcode = '23514';
  end if;
  if public.is_blocked_between(p_sender, p_recipient) then
    raise exception 'You cannot message this person' using errcode = '42501';
  end if;

  if exists (select 1 from public.profile_settings where id = p_sender and site_role = 'admin') then
    return 'accepted';
  end if;

  v_follows := exists (select 1 from public.follows where follower_id = p_recipient and followee_id = p_sender);
  if v_policy = 'nobody' then
    raise exception 'This person is not taking new messages' using errcode = '42501';
  end if;
  if v_policy = 'following' and not v_follows then
    raise exception 'This person only takes messages from people they follow' using errcode = '42501';
  end if;
  return case when v_follows then 'accepted' else 'pending' end::public.participant_status;
end;
$$;

revoke execute on function public.initial_participant_status from anon, authenticated;

create function public.start_direct_conversation(p_user_id uuid)
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
    update public.conversation_participants set status = 'accepted'
    where conversation_id = v_id and user_id = v_me and status = 'pending';
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

create function public.create_group_conversation(p_title text, p_member_ids uuid[])
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
  v_members uuid[];
  v_id uuid;
  v_member uuid;
begin
  if not public.is_active_member() then
    raise exception 'Sign in to start a group' using errcode = '42501';
  end if;
  select array_agg(distinct m) into v_members from unnest(p_member_ids) m where m <> v_me;
  if coalesce(cardinality(v_members), 0) < 1 or cardinality(v_members) > 99 then
    raise exception 'Groups have 2 to 100 people' using errcode = '23514';
  end if;

  insert into public.conversations (kind, title, created_by)
  values ('group', nullif(left(trim(p_title), 60), ''), v_me) returning id into v_id;
  insert into public.conversation_participants (conversation_id, user_id, role, status)
  values (v_id, v_me, 'owner', 'accepted');

  foreach v_member in array v_members loop
    insert into public.conversation_participants (conversation_id, user_id, status)
    values (v_id, v_member, public.initial_participant_status(v_me, v_member));
  end loop;
  return v_id;
end;
$$;

create function public.add_group_members(p_conversation_id uuid, p_member_ids uuid[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_member uuid;
begin
  if not exists (
    select 1 from public.conversation_participants cp join public.conversations c on c.id = cp.conversation_id
    where cp.conversation_id = p_conversation_id and cp.user_id = auth.uid() and cp.role in ('owner', 'admin') and c.kind = 'group'
  ) then
    raise exception 'Only group admins can add people' using errcode = '42501';
  end if;
  if (select count(*) from public.conversation_participants where conversation_id = p_conversation_id) + cardinality(p_member_ids) > 100 then
    raise exception 'Groups have up to 100 people' using errcode = '23514';
  end if;

  foreach v_member in array p_member_ids loop
    if v_member <> auth.uid() then
      insert into public.conversation_participants (conversation_id, user_id, status)
      values (p_conversation_id, v_member, public.initial_participant_status(auth.uid(), v_member))
      on conflict do nothing;
    end if;
  end loop;
end;
$$;

create function public.set_group_role(p_conversation_id uuid, p_user_id uuid, p_role public.participant_role)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_role = 'owner' or not exists (
    select 1 from public.conversation_participants
    where conversation_id = p_conversation_id and user_id = auth.uid() and role = 'owner'
  ) then
    raise exception 'Only the group owner can change roles' using errcode = '42501';
  end if;
  update public.conversation_participants set role = p_role
  where conversation_id = p_conversation_id and user_id = p_user_id and role <> 'owner';
end;
$$;

-- Removes someone (admins) or leaves (anyone). When the owner leaves, the
-- longest-standing member takes over; a group everyone left is deleted.
create function public.remove_group_member(p_conversation_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_user_id <> auth.uid() and not exists (
    select 1 from public.conversation_participants
    where conversation_id = p_conversation_id and user_id = auth.uid() and role in ('owner', 'admin')
  ) then
    raise exception 'Only group admins can remove people' using errcode = '42501';
  end if;

  delete from public.conversation_participants cp
  using public.conversations c
  where c.id = cp.conversation_id and c.kind = 'group'
    and cp.conversation_id = p_conversation_id and cp.user_id = p_user_id
    and (cp.role <> 'owner' or p_user_id = auth.uid());

  if not exists (select 1 from public.conversation_participants where conversation_id = p_conversation_id and role = 'owner') then
    update public.conversation_participants set role = 'owner'
    where (conversation_id, user_id) = (
      select conversation_id, user_id from public.conversation_participants
      where conversation_id = p_conversation_id and status = 'accepted'
      order by joined_at limit 1
    );
  end if;

  if not exists (select 1 from public.conversation_participants where conversation_id = p_conversation_id and status = 'accepted') then
    delete from public.conversations where id = p_conversation_id;
  end if;
end;
$$;

create function public.rename_group(p_conversation_id uuid, p_title text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.conversation_participants
    where conversation_id = p_conversation_id and user_id = auth.uid() and role in ('owner', 'admin')
  ) then
    raise exception 'Only group admins can rename the group' using errcode = '42501';
  end if;
  update public.conversations set title = nullif(left(trim(p_title), 60), '')
  where id = p_conversation_id and kind = 'group';
end;
$$;

create function public.respond_to_message_request(p_conversation_id uuid, p_accept boolean)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.conversation_participants
  set status = case when p_accept then 'accepted' else 'declined' end::public.participant_status,
      last_read_at = case when p_accept then last_read_at else now() end
  where conversation_id = p_conversation_id and user_id = auth.uid() and status = 'pending'
$$;

-- When the participant last read the conversation, shared only when both they
-- and the viewer have read receipts on.
create function public.shared_read_at(p_conversation_id uuid, p_user_id uuid)
returns timestamptz
language sql
stable
security definer
set search_path = ''
as $$
  select cp.last_read_at
  from public.conversation_participants cp
  where cp.conversation_id = p_conversation_id and cp.user_id = p_user_id
    and public.is_participant(p_conversation_id)
    and (select read_receipts from public.profile_settings where id = p_user_id)
    and (select read_receipts from public.profile_settings where id = auth.uid())
$$;

create view public.conversation_list
with (security_invoker = true)
as
select
  c.id,
  c.kind,
  c.title,
  c.created_by,
  c.created_at,
  c.last_message_at,
  me.status as my_status,
  me.role as my_role,
  me.archived_at,
  me.muted,
  me.last_read_at,
  (
    select count(*) from public.messages m
    where m.conversation_id = c.id and m.created_at > me.last_read_at
      and m.sender_id is distinct from me.user_id and m.removed_at is null
  )::integer as unread_count,
  (
    select jsonb_build_object('body', left(m.body, 140), 'sender_id', m.sender_id, 'created_at', m.created_at,
      'images', cardinality(m.image_paths), 'removed', m.removed_at is not null)
    from public.messages m where m.conversation_id = c.id
    order by m.created_at desc limit 1
  ) as last_message,
  (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', p.id, 'username', p.username, 'display_name', p.display_name, 'avatar_url', p.avatar_url,
      'colour', public.profile_colour(p.colour, p.id), 'status', cp.status, 'role', cp.role,
      'read_at', public.shared_read_at(c.id, cp.user_id)
    ) order by cp.joined_at), '[]'::jsonb)
    from public.conversation_participants cp
    join public.profiles p on p.id = cp.user_id
    where cp.conversation_id = c.id and cp.user_id <> me.user_id and cp.status <> 'declined'
  ) as members
from public.conversations c
join public.conversation_participants me on me.conversation_id = c.id and me.user_id = auth.uid()
where me.status <> 'declined';

create function public.unread_message_count()
returns integer
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(sum(unread_count), 0)::integer
  from public.conversation_list
  where my_status = 'accepted' and archived_at is null and not muted
$$;
