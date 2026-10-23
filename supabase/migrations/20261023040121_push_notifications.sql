-- Push notifications for the app, sent by the database through Expo's push
-- service (https://exp.host), which hands them to Apple and Google. Expo's
-- service is free, needs no server of ours, and works with builds made in
-- Xcode; sending to Apple directly would need the server to sign every batch.
--
--   * The app registers its Expo push token with register_push_token once the
--     member allows notifications, and removes it with unregister_push_token
--     on sign-out. Deleting the account deletes its tokens.
--   * A trigger on notifications and one on messages put a row in push_outbox
--     for members who have a token and haven't switched that kind off
--     (profile_settings.push_off). notify() has already left out muted and
--     blocked people; the messages trigger does the same, and skips muted
--     conversations.
--   * Rows are grouped while they wait: likes on a post and new followers
--     at most once an hour ("and 4 others"), a conversation at most once a
--     minute. Everything else goes straight away.
--   * send_due_pushes runs at the end of each statement that queued something
--     and every minute from pg_cron (for the grouped rows). It hands up to 100
--     messages per request to pg_net, so a busy minute is a handful of
--     requests and no function on Vercel runs at all.
--   * settle_pushes reads Expo's answers: a token Apple or Google no longer
--     knows (DeviceNotRegistered) is deleted, from the ticket at once or from
--     the receipt 15 minutes later, as Expo asks.
--
-- Pushes say who did what, and for replies, mentions and quotes show the start
-- of that public post. Never a message's words: those stay in Mavuno.
--
-- Optional: an Expo access token in Vault as 'expo_push_access_token', once
-- "enhanced push security" is turned on for the project at expo.dev.

create type public.push_kind as enum (
  'reply', 'mention', 'quote', 'like', 'follow', 'joined', 'event_rsvp', 'org_added', 'moderation', 'message', 'message_request'
);

-- The kinds the member switched off. Everything is on until then; the phone
-- itself decides whether Mavuno may notify at all.
alter table public.profile_settings add column push_off public.push_kind[] not null default '{}';

grant update (push_off) on public.profile_settings to authenticated;

create table public.push_tokens (
  token text primary key check (token ~ '^Expo(nent)?PushToken\[[A-Za-z0-9_-]{1,200}\]$'),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  -- The app registers again on every launch, so this is when it was last open.
  seen_at timestamptz not null default now()
);

create index push_tokens_profile_idx on public.push_tokens (profile_id);
alter table public.push_tokens enable row level security;

create table public.push_outbox (
  id bigint generated always as identity primary key,
  recipient_id uuid not null references public.profiles (id) on delete cascade,
  kind public.push_kind not null,
  -- Rows with the same key wait as one: 'like:<post>', 'follow', 'message:<conversation>'.
  group_key text not null,
  actor_id uuid references public.profiles (id) on delete cascade,
  -- How many things this row stands for.
  merged integer not null default 1,
  post_id uuid,
  event_id uuid,
  conversation_id uuid,
  send_after timestamptz not null default now(),
  -- Sent rows stay for a day so the next one in their group waits its turn.
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index push_outbox_waiting_idx on public.push_outbox (recipient_id, group_key) where sent_at is null;
create index push_outbox_due_idx on public.push_outbox (send_after) where sent_at is null;
create index push_outbox_sent_idx on public.push_outbox (recipient_id, group_key, sent_at) where sent_at is not null;
create index push_outbox_actor_idx on public.push_outbox (actor_id);
alter table public.push_outbox enable row level security;

-- Requests handed to pg_net whose answers settle_pushes hasn't read yet.
-- `tokens` is in the order of the messages sent; `tickets` the receipts asked for.
create table public.push_requests (
  id bigint primary key,
  kind text not null check (kind in ('send', 'receipts')),
  tokens text[] not null default '{}',
  tickets text[] not null default '{}',
  created_at timestamptz not null default now()
);

alter table public.push_requests enable row level security;

-- Expo's ticket for each push it accepted, until its receipt is read.
create table public.push_tickets (
  id text primary key,
  token text not null,
  asked_at timestamptz,
  created_at timestamptz not null default now()
);

create index push_tickets_unasked_idx on public.push_tickets (created_at) where asked_at is null;
alter table public.push_tickets enable row level security;

-- ---------------------------------------------------------------------------
-- Tokens
-- ---------------------------------------------------------------------------

-- A phone has one token. Whoever signed in on it last gets its pushes, and a
-- member keeps at most ten phones; the longest unused goes first.
create function public.register_push_token(p_token text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Sign in first' using errcode = '42501';
  end if;
  insert into public.push_tokens (token, profile_id) values (p_token, auth.uid())
  on conflict (token) do update set profile_id = excluded.profile_id, seen_at = now(),
    created_at = case when public.push_tokens.profile_id = excluded.profile_id then public.push_tokens.created_at else now() end;
  delete from public.push_tokens
  where profile_id = auth.uid() and token in (
    select token from public.push_tokens where profile_id = auth.uid() order by seen_at desc offset 10
  );
end;
$$;

-- Knowing a token is proof enough of holding the phone, so this works signed
-- out too: a session that expired can still stop its pushes.
create function public.unregister_push_token(p_token text)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.push_tokens where token = p_token
$$;

-- ---------------------------------------------------------------------------
-- Queueing
-- ---------------------------------------------------------------------------

create function public.queue_push(
  p_recipient_id uuid,
  p_kind public.push_kind,
  p_group_key text,
  p_actor_id uuid,
  p_post_id uuid default null,
  p_event_id uuid default null,
  p_conversation_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_wait interval := case p_kind
    when 'like' then interval '1 hour'
    when 'follow' then interval '1 hour'
    when 'event_rsvp' then interval '1 hour'
    when 'message' then interval '1 minute'
    -- Group members who haven't accepted would otherwise hear every message.
    when 'message_request' then interval '1 day'
    else interval '0'
  end;
  v_last timestamptz;
begin
  if not exists (select 1 from public.push_tokens where profile_id = p_recipient_id)
     or exists (select 1 from public.profile_settings where id = p_recipient_id and p_kind = any (push_off)) then
    return;
  end if;
  select max(sent_at) into v_last from public.push_outbox
  where recipient_id = p_recipient_id and group_key = p_group_key and sent_at is not null;

  insert into public.push_outbox (recipient_id, kind, group_key, actor_id, post_id, event_id, conversation_id, send_after)
  values (p_recipient_id, p_kind, p_group_key, p_actor_id, p_post_id, p_event_id, p_conversation_id, greatest(now(), v_last + v_wait))
  on conflict (recipient_id, group_key) where sent_at is null do update
  set merged = public.push_outbox.merged + 1, actor_id = excluded.actor_id;
end;
$$;

create function public.queue_notification_push()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_kind public.push_kind := new.type::text::public.push_kind;
begin
  perform public.queue_push(
    new.recipient_id, v_kind,
    case new.type
      when 'like' then 'like:' || new.post_id
      when 'follow' then 'follow'
      when 'event_rsvp' then 'event_rsvp:' || new.event_id
      else new.type || ':' || new.id
    end,
    new.actor_id, new.post_id, new.event_id
  );
  return null;
end;
$$;

create trigger notifications_queue_push after insert on public.notifications
  for each row execute function public.queue_notification_push();

-- After messages_handle_new (triggers run in name order), which brings
-- archived conversations back, so archiving doesn't silence anyone.
create function public.queue_message_push()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_to record;
begin
  if new.sender_id is null then
    return null;
  end if;
  for v_to in
    select cp.user_id, cp.status from public.conversation_participants cp
    where cp.conversation_id = new.conversation_id and cp.user_id <> new.sender_id
      and cp.status <> 'declined' and not cp.muted and new.created_at >= cp.visible_from
      and exists (select 1 from public.push_tokens t where t.profile_id = cp.user_id)
      and not public.is_blocked_between(cp.user_id, new.sender_id)
      and not exists (select 1 from public.mutes m where m.muter_id = cp.user_id and m.muted_id = new.sender_id)
  loop
    perform public.queue_push(
      v_to.user_id,
      case v_to.status when 'pending' then 'message_request' else 'message' end::public.push_kind,
      v_to.status || ':' || new.conversation_id,
      new.sender_id, null, null, new.conversation_id
    );
  end loop;
  return null;
end;
$$;

create trigger messages_queue_push after insert on public.messages
  for each row execute function public.queue_message_push();

-- ---------------------------------------------------------------------------
-- Sending
-- ---------------------------------------------------------------------------

-- The number on the app icon: the app's two badges added up, near enough.
-- The app sets the exact number whenever it opens.
create function public.push_badge(p_profile_id uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select (
    (select count(distinct public.notification_group_key(n.type, n.id, n.post_id, p.root_id, n.event_id, n.created_at, 'Australia/Sydney'))
     from public.notifications n left join public.posts p on p.id = n.post_id
     where n.recipient_id = p_profile_id and n.read_at is null and (p.id is null or p.deleted_at is null))
    + (select count(*) from public.conversation_participants cp
       join public.messages m on m.conversation_id = cp.conversation_id
       where cp.user_id = p_profile_id and cp.status = 'accepted' and cp.archived_at is null and not cp.muted
         and m.created_at > cp.last_read_at and m.created_at >= cp.visible_from
         and m.sender_id is distinct from p_profile_id and m.removed_at is null)
    + (select count(*) from public.conversation_participants where user_id = p_profile_id and status = 'pending')
  )::integer
$$;

-- The start of a post, on one line.
create function public.push_snippet(p_body text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case when char_length(t) > 120 then left(t, 119) || '…' else t end
  from (select trim(regexp_replace(coalesce(p_body, ''), '\s+', ' ', 'g')) as t) as s
$$;

-- What a waiting row says and where tapping it goes, or null when it should
-- no longer go out: the kind was switched off, the actor muted or blocked
-- since, the post is gone, or the recipient can't use Mavuno.
create function public.push_message(p_row public.push_outbox)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor public.profiles;
  v_name text;
  v_others integer := p_row.merged - 1;
  v_and text;
  v_post public.posts;
  v_title text;
  v_body text;
  v_path text;
begin
  if exists (
    select 1 from public.profile_settings s
    where s.id = p_row.recipient_id
      and (p_row.kind = any (s.push_off) or s.banned_at is not null or s.age_deactivated_at is not null)
  ) then
    return null;
  end if;
  select * into v_actor from public.profiles where id = p_row.actor_id;
  if p_row.actor_id is not null and (
    v_actor.id is null
    or public.is_blocked_between(p_row.recipient_id, p_row.actor_id)
    or exists (select 1 from public.mutes where muter_id = p_row.recipient_id and muted_id = p_row.actor_id)
  ) then
    return null;
  end if;
  if p_row.post_id is not null then
    select * into v_post from public.posts where id = p_row.post_id;
    if v_post.id is null or v_post.deleted_at is not null then
      return null;
    end if;
  end if;
  if p_row.kind in ('like', 'follow', 'event_rsvp') then
    -- Unliking and liking again inserts the notification again, so count people, not inserts.
    select greatest(count(distinct n.actor_id) - 1, 0) into v_others from public.notifications n
    where n.recipient_id = p_row.recipient_id and n.type::text = p_row.kind::text
      and (p_row.kind <> 'like' or n.post_id = p_row.post_id)
      and (p_row.kind <> 'event_rsvp' or n.event_id = p_row.event_id)
      and n.created_at >= p_row.created_at;
  end if;
  v_name := coalesce(nullif(v_actor.display_name, ''), '@' || v_actor.username, 'Someone');
  v_and := case when v_others = 1 then ' and 1 other' when v_others > 1 then ' and ' || v_others || ' others' else '' end;

  -- In the inbox's words (VERBS in the app's notification-row.tsx). A post's
  -- words go under the name, as a message would.
  case p_row.kind
    when 'reply' then
      v_title := v_name || ' replied';
      v_body := public.push_snippet(v_post.body);
      v_path := '/post/' || p_row.post_id;
    when 'mention' then
      v_title := v_name || ' mentioned you';
      v_body := public.push_snippet(v_post.body);
      v_path := '/post/' || p_row.post_id;
    when 'quote' then
      v_title := v_name || ' quoted your post';
      v_body := public.push_snippet(v_post.body);
      v_path := '/post/' || p_row.post_id;
    when 'like' then
      v_body := v_name || v_and || ' liked your post';
      v_path := '/post/' || p_row.post_id;
    when 'follow' then
      v_body := v_name || v_and || ' followed you';
      v_path := case when v_others = 0 then '/profile/' || v_actor.username else '/notifications' end;
    when 'joined' then
      v_body := v_name || ' joined Mavuno from your invite';
      v_path := '/profile/' || v_actor.username;
    when 'event_rsvp' then
      select title into v_title from public.events where id = p_row.event_id;
      if v_title is null then
        return null;
      end if;
      v_body := v_name || v_and || case when v_others > 0 then ' are going to ' else ' is going to ' end || v_title;
      v_title := null;
      v_path := '/event/' || p_row.event_id;
    when 'org_added' then
      v_body := v_name || ' invited you to its team';
      v_path := '/settings/organisations';
    when 'moderation' then
      v_body := 'An update from Mavuno''s moderators';
      v_path := '/notifications';
    when 'message', 'message_request' then
      select c.title into v_title from public.conversations c where c.id = p_row.conversation_id and c.kind = 'group';
      if v_title is not null then
        v_body := case when p_row.merged > 1 then p_row.merged || ' new messages' else v_name || ' sent a message' end;
      else
        v_title := v_name;
        v_body := case
          when p_row.kind = 'message_request' then 'Wants to send you a message'
          when p_row.merged > 1 then 'Sent you ' || p_row.merged || ' messages'
          else 'Sent you a message'
        end;
      end if;
      v_path := '/conversation/' || p_row.conversation_id;
  end case;

  return jsonb_strip_nulls(jsonb_build_object(
    'title', v_title,
    'body', v_body,
    -- The app opens `path` only for the member it was sent to.
    'data', jsonb_build_object('path', v_path, 'recipient', p_row.recipient_id),
    'sound', 'default',
    'badge', public.push_badge(p_row.recipient_id),
    'priority', 'high',
    'ttl', 86400,
    -- A grouped row replaces the one before it on the lock screen.
    'collapseId', case when p_row.kind in ('like', 'follow', 'event_rsvp', 'message', 'message_request') then p_row.group_key end,
    'threadId', p_row.group_key
  ));
end;
$$;

-- Hands every due row to Expo, 100 messages a request. Never fails the
-- statement that queued them: a database error leaves the rows due for the
-- next minute's run. A push Expo refuses or doesn't answer isn't retried;
-- the notification is still in the inbox.
create function public.send_due_pushes()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_access text;
  v_headers jsonb := '{"Content-Type": "application/json", "Accept": "application/json"}';
  v_batches jsonb;
  v_batch jsonb;
  v_tokens text[];
  v_request bigint;
  v_sent integer := 0;
begin
  if to_regprocedure('net.http_post(text, jsonb, jsonb, jsonb, integer)') is null
     or not exists (select 1 from public.push_outbox where sent_at is null and send_after <= now()) then
    return 0;
  end if;
  select decrypted_secret into v_access from vault.decrypted_secrets where name = 'expo_push_access_token';
  if v_access is not null then
    v_headers := v_headers || jsonb_build_object('Authorization', 'Bearer ' || v_access);
  end if;

  begin
    with due as (
      update public.push_outbox o set sent_at = now()
      where o.id in (
        select id from public.push_outbox
        where sent_at is null and send_after <= now()
        order by send_after
        limit 500
        for update skip locked
      )
      returning o
    ),
    addressed as (
      select t.token, jsonb_build_object('to', t.token) || m.message as message,
        (row_number() over (order by t.token) - 1) / 100 as batch
      from due
      cross join lateral (select public.push_message(due.o) as message) as m
      join public.push_tokens t on t.profile_id = (due.o).recipient_id
      where m.message is not null
    )
    select jsonb_agg(b) into v_batches from (
      select jsonb_agg(token order by token) as tokens, jsonb_agg(message order by token) as messages
      from addressed group by batch
    ) as b;

    for v_batch in select value from jsonb_array_elements(coalesce(v_batches, '[]')) loop
      v_tokens := array(select jsonb_array_elements_text(v_batch -> 'tokens'));
      v_request := net.http_post(
        url := 'https://exp.host/--/api/v2/push/send',
        body := v_batch -> 'messages',
        headers := v_headers,
        timeout_milliseconds := 10000
      );
      insert into public.push_requests (id, kind, tokens) values (v_request, 'send', v_tokens);
      v_sent := v_sent + cardinality(v_tokens);
    end loop;
  exception when others then
    raise warning 'Push notifications not sent: %', sqlerrm;
    return 0;
  end;
  return v_sent;
end;
$$;

-- At commit, so a message to a group of forty or a post mentioning five
-- people goes out as one request. The first row's call sends them all; the
-- rest find nothing due.
create function public.send_queued_pushes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.send_due_pushes();
  return null;
end;
$$;

create constraint trigger push_outbox_send after insert on public.push_outbox
  deferrable initially deferred
  for each row execute function public.send_queued_pushes();

-- Reads Expo's answers to earlier requests, asks for receipts 15 minutes
-- after sending, and clears what is no longer needed.
create function public.settle_pushes()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request record;
  v_answer jsonb;
  v_tickets text[];
  v_id bigint;
  v_access text;
  v_headers jsonb := '{"Content-Type": "application/json", "Accept": "application/json"}';
  v_groups jsonb;
begin
  if to_regclass('net._http_response') is null then
    return;
  end if;

  for v_request in
    execute 'select r.id, r.kind, r.tokens, r.tickets, h.status_code, h.content
      from public.push_requests r join net._http_response h on h.id = r.id'
  loop
    begin
      v_answer := case when v_request.status_code between 200 and 499 then v_request.content::jsonb end;
      -- A batch with tokens from more than one Expo project is refused whole.
      -- Mavuno's own tokens are the larger group; anyone registering a token
      -- from another project loses it, so it can't keep blocking others.
      v_groups := v_answer -> 'errors' -> 0 -> 'details';
      if v_request.kind = 'send' and v_answer -> 'errors' -> 0 ->> 'code' = 'PUSH_TOO_MANY_EXPERIENCE_IDS' and jsonb_typeof(v_groups) = 'object' then
        delete from public.push_tokens where token in (
          select jsonb_array_elements_text(g.tokens) from (
            select value as tokens, row_number() over (order by jsonb_array_length(value) desc, key) as rank
            from jsonb_each(v_groups) where jsonb_typeof(value) = 'array'
          ) as g where g.rank > 1
        );
      end if;
      if v_request.kind = 'send' and jsonb_typeof(v_answer -> 'data') = 'array' then
        delete from public.push_tokens where token in (
          select v_request.tokens[t.n] from jsonb_array_elements(v_answer -> 'data') with ordinality as t (ticket, n)
          where t.ticket -> 'details' ->> 'error' = 'DeviceNotRegistered'
        );
        insert into public.push_tickets (id, token)
        select t.ticket ->> 'id', v_request.tokens[t.n]
        from jsonb_array_elements(v_answer -> 'data') with ordinality as t (ticket, n)
        where t.ticket ->> 'status' = 'ok' and t.ticket ->> 'id' is not null and v_request.tokens[t.n] is not null
        on conflict do nothing;
      elsif v_request.kind = 'receipts' and jsonb_typeof(v_answer -> 'data') = 'object' then
        delete from public.push_tokens where token in (
          select k.token from public.push_tickets k join jsonb_each(v_answer -> 'data') as r (id, receipt) on r.id = k.id
          where r.receipt -> 'details' ->> 'error' = 'DeviceNotRegistered'
        );
        delete from public.push_tickets where id = any (v_request.tickets);
      end if;
    exception when others then
      raise warning 'Push answer % not read: %', v_request.id, sqlerrm;
    end;
    delete from public.push_requests where id = v_request.id;
  end loop;

  -- pg_net keeps answers for six hours; one that never came won't now.
  delete from public.push_requests where created_at < now() - interval '6 hours';

  select array_agg(id) into v_tickets from (
    select id from public.push_tickets
    where asked_at is null and created_at < now() - interval '15 minutes'
    order by created_at limit 1000
  ) as due;
  if v_tickets is not null and to_regprocedure('net.http_post(text, jsonb, jsonb, jsonb, integer)') is not null then
    -- Receipts need the same access token as sends once Expo's enhanced security is on.
    select decrypted_secret into v_access from vault.decrypted_secrets where name = 'expo_push_access_token';
    if v_access is not null then
      v_headers := v_headers || jsonb_build_object('Authorization', 'Bearer ' || v_access);
    end if;
    v_id := net.http_post(
      url := 'https://exp.host/--/api/v2/push/getReceipts',
      body := jsonb_build_object('ids', to_jsonb(v_tickets)),
      headers := v_headers,
      timeout_milliseconds := 10000
    );
    insert into public.push_requests (id, kind, tickets) values (v_id, 'receipts', v_tickets);
    update public.push_tickets set asked_at = now() where id = any (v_tickets);
  end if;

  -- Expo keeps receipts for a day.
  delete from public.push_tickets where created_at < now() - interval '1 day';
  delete from public.push_outbox where sent_at < now() - interval '1 day';
end;
$$;

do $$
begin
  create extension if not exists pg_cron with schema pg_catalog;
  perform cron.schedule('mavuno-push-notifications', '* * * * *', 'select public.send_due_pushes(); select public.settle_pushes()');
exception when others then
  raise notice 'pg_cron is not available (%); grouped pushes wait for the next one sent straight away', sqlerrm;
end;
$$;

-- ---------------------------------------------------------------------------
-- The export lists the phones that get pushes (when, not the tokens)
-- ---------------------------------------------------------------------------

create or replace function public.export_my_data()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'exported_at', now(),
    'account', (select jsonb_build_object(
        'email', u.email, 'created_at', u.created_at, 'last_sign_in_at', u.last_sign_in_at,
        'providers', (select coalesce(jsonb_agg(distinct i.provider), '[]') from auth.identities i where i.user_id = u.id))
      from auth.users u where u.id = auth.uid()),
    'profile', (select to_jsonb(p) from public.profiles p where p.id = auth.uid()),
    'settings', (select to_jsonb(s) - 'site_role' from public.profile_settings s where s.id = auth.uid()),
    'activity', (select jsonb_build_object('last_seen', a.last_seen) from public.member_activity a where a.id = auth.uid()),
    'invited_by', (select jsonb_build_object('username', p.username, 'since', i.created_at)
      from public.invites i left join public.profiles p on p.id = i.invited_by where i.member_id = auth.uid()),
    'invited', (select coalesce(jsonb_agg(jsonb_build_object('username', p.username, 'since', i.created_at) order by i.created_at), '[]')
      from public.invites i join public.profiles p on p.id = i.member_id where i.invited_by = auth.uid()),
    'organisations', (select coalesce(jsonb_agg(jsonb_build_object('username', o.username, 'role', m.role, 'since', m.created_at)), '[]')
      from public.organisation_members m join public.profiles o on o.id = m.org_id where m.user_id = auth.uid()),
    'posts', (select coalesce(jsonb_agg(to_jsonb(p) - 'hot_score' order by p.created_at), '[]')
      from public.posts p where p.created_by = auth.uid() and p.deleted_at is null),
    'post_images', (select coalesce(jsonb_agg(jsonb_build_object('post_id', i.post_id, 'url', i.url, 'alt', i.alt_text)), '[]')
      from public.post_images i join public.posts p on p.id = i.post_id where p.created_by = auth.uid()),
    'scheduled_posts', (select coalesce(jsonb_agg(to_jsonb(s) - 'created_by' order by s.scheduled_at), '[]')
      from public.scheduled_posts s where s.created_by = auth.uid()),
    'poll_votes', (select coalesce(jsonb_agg(to_jsonb(v)), '[]') from public.poll_votes v where v.user_id = auth.uid()),
    'likes', (select coalesce(jsonb_agg(to_jsonb(l)), '[]') from public.likes l where l.user_id = auth.uid()),
    'saved_posts', (select coalesce(jsonb_agg(to_jsonb(s)), '[]') from public.saves s where s.user_id = auth.uid()),
    'following', (select coalesce(jsonb_agg(jsonb_build_object('username', p.username, 'since', f.created_at)), '[]')
      from public.follows f join public.profiles p on p.id = f.followee_id where f.follower_id = auth.uid()),
    'followers', (select coalesce(jsonb_agg(jsonb_build_object('username', p.username, 'since', f.created_at)), '[]')
      from public.follows f join public.profiles p on p.id = f.follower_id where f.followee_id = auth.uid()),
    'mutes', (select coalesce(jsonb_agg(jsonb_build_object('username', p.username, 'since', m.created_at)), '[]')
      from public.mutes m join public.profiles p on p.id = m.muted_id where m.muter_id = auth.uid()),
    'blocks', (select coalesce(jsonb_agg(jsonb_build_object('username', p.username, 'since', b.created_at)), '[]')
      from public.blocks b join public.profiles p on p.id = b.blocked_id where b.blocker_id = auth.uid()),
    'dismissed_suggestions', (select coalesce(jsonb_agg(jsonb_build_object('username', p.username, 'since', d.created_at)), '[]')
      from public.suggestion_dismissals d join public.profiles p on p.id = d.dismissed_id where d.user_id = auth.uid()),
    'spaces', (select coalesce(jsonb_agg(jsonb_build_object('slug', s.slug, 'role', m.role, 'since', m.joined_at)), '[]')
      from public.space_members m join public.spaces s on s.id = m.space_id where m.user_id = auth.uid()),
    'events_hosted', (select coalesce(jsonb_agg(to_jsonb(e)), '[]') from public.events e where e.created_by = auth.uid()),
    'event_rsvps', (select coalesce(jsonb_agg(to_jsonb(r)), '[]') from public.event_rsvps r where r.user_id = auth.uid()),
    'opportunities', (select coalesce(jsonb_agg(to_jsonb(o)), '[]') from public.opportunities o where o.created_by = auth.uid()),
    'saved_opportunities', (select coalesce(jsonb_agg(to_jsonb(s)), '[]') from public.saved_opportunities s where s.user_id = auth.uid()),
    'conversations', (select coalesce(jsonb_agg(jsonb_build_object(
        'conversation_id', cp.conversation_id, 'status', cp.status, 'role', cp.role, 'archived_at', cp.archived_at,
        'muted', cp.muted, 'last_read_at', cp.last_read_at, 'joined_at', cp.joined_at) order by cp.joined_at), '[]')
      from public.conversation_participants cp where cp.user_id = auth.uid()),
    'messages_sent', (select coalesce(jsonb_agg(jsonb_build_object(
        'conversation_id', m.conversation_id, 'body', m.body, 'image_paths', m.image_paths, 'image_alts', m.image_alts,
        'reply_to_id', m.reply_to_id, 'created_at', m.created_at) order by m.created_at), '[]')
      from public.messages m where m.sender_id = auth.uid()),
    'message_reactions', (select coalesce(jsonb_agg(to_jsonb(r)), '[]') from public.message_reactions r where r.user_id = auth.uid()),
    'notifications', (select coalesce(jsonb_agg(jsonb_build_object(
        'type', n.type, 'actor', a.username, 'post_id', n.post_id, 'created_at', n.created_at, 'read_at', n.read_at,
        'message', n.message) order by n.created_at), '[]')
      from public.notifications n left join public.profiles a on a.id = n.actor_id where n.recipient_id = auth.uid()),
    'push_devices', (select coalesce(jsonb_agg(jsonb_build_object('registered_at', t.created_at, 'last_opened_at', t.seen_at) order by t.created_at), '[]')
      from public.push_tokens t where t.profile_id = auth.uid())
  )
  where auth.uid() is not null
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

revoke all on table public.push_tokens, public.push_outbox, public.push_requests, public.push_tickets from public, anon, authenticated;
grant all on table public.push_tokens, public.push_outbox, public.push_requests, public.push_tickets to service_role;

revoke all on function
  public.register_push_token(text),
  public.unregister_push_token(text),
  public.queue_push(uuid, public.push_kind, text, uuid, uuid, uuid, uuid),
  public.queue_notification_push(),
  public.queue_message_push(),
  public.push_badge(uuid),
  public.push_snippet(text),
  public.push_message(public.push_outbox),
  public.send_due_pushes(),
  public.send_queued_pushes(),
  public.settle_pushes()
from public, anon, authenticated;

grant execute on function public.register_push_token(text) to authenticated;
grant execute on function public.unregister_push_token(text) to anon, authenticated;
