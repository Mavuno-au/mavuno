-- Push gaps found in a full review on 23 October 2026.
--
-- 1. register_push_token had no limit and took any token, so someone could
--    keep registering tokens from another Expo project; Expo refuses a whole
--    batch that mixes projects, and those batches' pushes were lost each
--    minute. Tokens it refused now stay refused, and new tokens count towards
--    a daily limit.
-- 2. A reply, mention or quote from someone the automatic check covers was
--    pushed, words and all, before the check could hold it, and a push for a
--    held post still went out. The push now leaves out the words until the
--    post has been checked, and nothing is pushed about a post that isn't
--    published.
-- 3. Signing out everywhere left the member's other phones getting their
--    pushes. unregister_my_push_tokens removes them all.
-- 4. A batch Expo refused was lost without a word; it now shows on Health.

-- ---------------------------------------------------------------------------
-- 1. Limits on registering phones
-- ---------------------------------------------------------------------------

create table public.push_tokens_refused (
  token text primary key,
  created_at timestamptz not null default now()
);
alter table public.push_tokens_refused enable row level security;
revoke all on public.push_tokens_refused from anon, authenticated;

create or replace function public.register_push_token(p_token text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Sign in first' using errcode = '42501';
  end if;
  if exists (select 1 from public.push_tokens_refused where token = p_token) then
    raise exception 'That phone can''t get notifications from Mavuno' using errcode = '23514';
  end if;
  -- The app registers on every launch; only a phone new to this member counts.
  if not exists (select 1 from public.push_tokens where token = p_token and profile_id = auth.uid()) then
    perform public.count_towards_limit(auth.uid(), 'push_token', 20, interval '1 day', 'Too many phones registered today. Try again tomorrow.');
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

create or replace function public.settle_pushes()
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
      -- A refused batch is lost; Health should say so rather than stay quiet.
      if v_request.kind = 'send' and (v_request.status_code not between 200 and 299 or v_answer ? 'errors') then
        perform public.record_server_error(
          'push-' || coalesce(v_answer -> 'errors' -> 0 ->> 'code', v_request.status_code::text),
          'pg_net push send', 'route',
          'Expo refused a batch of pushes: ' || coalesce(v_answer -> 'errors' -> 0 ->> 'message', 'status ' || v_request.status_code)
        );
      end if;
      -- A batch with tokens from more than one Expo project is refused whole.
      -- Mavuno's own tokens are the larger group; anyone registering a token
      -- from another project loses it, so it can't keep blocking others.
      v_groups := v_answer -> 'errors' -> 0 -> 'details';
      if v_request.kind = 'send' and v_answer -> 'errors' -> 0 ->> 'code' = 'PUSH_TOO_MANY_EXPERIENCE_IDS' and jsonb_typeof(v_groups) = 'object' then
        with refused as (
          delete from public.push_tokens where token in (
            select jsonb_array_elements_text(g.tokens) from (
              select value as tokens, row_number() over (order by jsonb_array_length(value) desc, key) as rank
              from jsonb_each(v_groups) where jsonb_typeof(value) = 'array'
            ) as g where g.rank > 1
          )
          returning token
        )
        insert into public.push_tokens_refused (token) select token from refused on conflict do nothing;
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
  -- Long enough to outlast whoever kept registering them.
  delete from public.push_tokens_refused where created_at < now() - interval '30 days';
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Nothing about a held post, and no words before the check
-- ---------------------------------------------------------------------------

create or replace function public.push_message(p_row push_outbox)
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
  v_words text;
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
    -- A post held by the automatic check or a report waits, and a push about it
    -- shouldn't put its words on a lock screen meanwhile.
    if v_post.id is null or v_post.deleted_at is not null or v_post.status <> 'published' then
      return null;
    end if;
  end if;
  -- Words from someone without a track record wait for the automatic check,
  -- which can't recall a push.
  if p_row.kind in ('reply', 'mention', 'quote') and not exists (
    select 1 from public.background_tasks t
    where t.kind = 'automatic_check' and t.target_type = 'post' and t.target_id = v_post.id
  ) then
    v_words := public.push_snippet(v_post.body);
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
      v_body := v_words;
      v_path := '/post/' || p_row.post_id;
    when 'mention' then
      v_title := v_name || ' mentioned you';
      v_body := v_words;
      v_path := '/post/' || p_row.post_id;
    when 'quote' then
      v_title := v_name || ' quoted your post';
      v_body := v_words;
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

-- ---------------------------------------------------------------------------
-- 3. Signing out everywhere reaches every phone
-- ---------------------------------------------------------------------------

create function public.unregister_my_push_tokens()
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.push_tokens where profile_id = auth.uid()
$$;

revoke execute on function public.unregister_my_push_tokens() from public, anon;
grant execute on function public.unregister_my_push_tokens() to authenticated;
