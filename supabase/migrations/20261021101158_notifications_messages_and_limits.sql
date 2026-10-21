-- Notifications that count right, blocks and history in messages, and rate
-- limits the database enforces:
--   1. Notifications are grouped in the database (likes by post, follows by
--      the reader's day, RSVPs by event, mentions by thread; every reply on
--      its own), the badge counts groups, marking read follows the filter,
--      notifications about posts since held and follows since undone are
--      hidden, and a held post that goes up tells its author.
--   2. Blocking hides the direct conversation for both people and removes
--      likes both ways; nobody joins a group with someone they have a block
--      with; people added to a group read only what is sent after they join
--      unless the person adding them shares the history.
--   3. Message requests count in the Messages badge.
--   4. Follows, likes and saves are limited per minute like reactions are.

-- ---------------------------------------------------------------------------
-- 1. Notifications
-- ---------------------------------------------------------------------------

-- A reply, mention or quote whose post was later held for review, and a
-- follow since undone, would render as a row about nothing. Likes are on the
-- recipient's own post, which they always see, and a removal notice names a
-- post that is gone on purpose. An approval notice (no rule) only stands while
-- the post is up.
create or replace view public.notification_details
with (security_invoker = true)
as
select
  n.id,
  n.recipient_id,
  n.type,
  n.post_id,
  n.event_id,
  n.message,
  n.read_at,
  n.created_at,
  public.profile_card(n.actor_id) as actor,
  exists (select 1 from public.follows f where f.follower_id = n.recipient_id and f.followee_id = n.actor_id) as following_actor,
  (
    select jsonb_build_object('id', p.id, 'body', left(p.body, 400), 'parent_id', p.parent_id, 'root_id', p.root_id, 'quote_id', p.quote_id)
    from public.posts p where p.id = n.post_id
  ) as post,
  (select jsonb_build_object('id', e.id, 'title', e.title, 'starts_at', e.starts_at) from public.events e where e.id = n.event_id) as event,
  n.rule,
  n.moderation_action_id
from public.notifications n
where not public.is_blocked_with_viewer(n.actor_id)
  and not public.is_muted_by_viewer(n.actor_id)
  and not exists (select 1 from public.posts p where p.id = n.post_id and p.deleted_at is not null)
  and (
    n.post_id is null
    or n.type = 'like'
    or (n.type = 'moderation' and n.rule is not null)
    or exists (select 1 from public.posts p where p.id = n.post_id and p.status = 'published')
  )
  and (n.type <> 'follow' or exists (select 1 from public.follows f where f.follower_id = n.actor_id and f.followee_id = n.recipient_id));

-- Which row a notification is grouped under. Follows group by the reader's
-- day, so the zone is theirs; the badge uses the site's.
create function public.notification_group_key(
  p_type public.notification_type,
  p_id bigint,
  p_post_id uuid,
  p_root_id uuid,
  p_event_id uuid,
  p_created_at timestamptz,
  p_time_zone text
)
returns text
language sql
stable
set search_path = ''
as $$
  select case p_type
    when 'like' then 'like:' || coalesce(p_post_id::text, p_id::text)
    when 'follow' then 'follow:' || to_char(p_created_at at time zone p_time_zone, 'YYYY-MM-DD')
    when 'event_rsvp' then 'rsvp:' || coalesce(p_event_id::text, p_id::text)
    when 'mention' then 'thread:' || coalesce(p_root_id::text, p_post_id::text, p_id::text)
    else 'single:' || p_id::text
  end
$$;

-- A page of groups, newest activity first, with the three people most
-- recently involved and the newest notification of each. Paging is by
-- (latest_at, key), so a group that grows after it was shown stays where it
-- is until the next visit rather than appearing twice.
create function public.notification_groups(
  p_recipient_id uuid,
  p_types public.notification_type[] default null,
  p_time_zone text default 'Australia/Sydney',
  p_before_at timestamptz default null,
  p_before_key text default null,
  p_after_at timestamptz default null,
  p_limit integer default 20
)
returns table (
  key text,
  type public.notification_type,
  latest_at timestamptz,
  count integer,
  unread_count integer,
  actor_count integer,
  actors jsonb,
  latest jsonb
)
language sql
stable
set search_path = ''
as $$
  with keyed as (
    select d.*, public.notification_group_key(d.type, d.id, d.post_id, (d.post ->> 'root_id')::uuid, d.event_id, d.created_at, p_time_zone) as key
    from public.notification_details d
    where d.recipient_id = p_recipient_id
      and public.can_act_as(p_recipient_id)
      and (p_types is null or d.type = any (p_types))
  ),
  grouped as (
    select
      k.key,
      max(k.created_at) as latest_at,
      count(*)::integer as count,
      (count(*) filter (where k.read_at is null))::integer as unread_count,
      count(distinct k.actor ->> 'id')::integer as actor_count
    from keyed k
    group by k.key
  )
  select
    g.key,
    newest.type,
    g.latest_at,
    g.count,
    g.unread_count,
    g.actor_count,
    (
      select coalesce(jsonb_agg(a.actor order by a.latest desc, a.latest_id desc), '[]'::jsonb)
      from (
        select k.actor, max(k.created_at) as latest, max(k.id) as latest_id
        from keyed k where k.key = g.key and k.actor is not null
        group by k.actor order by max(k.created_at) desc, max(k.id) desc limit 3
      ) a
    ) as actors,
    to_jsonb(newest) - 'key' as latest
  from grouped g
  cross join lateral (
    select k.* from keyed k where k.key = g.key order by k.created_at desc, k.id desc limit 1
  ) newest
  where (p_before_at is null or (g.latest_at, g.key) < (p_before_at, p_before_key))
    and (p_after_at is null or g.latest_at > p_after_at)
  order by g.latest_at desc, g.key desc
  limit least(greatest(p_limit, 1), 50)
$$;

-- Everything in one group, for "See all".
create function public.notification_group_items(
  p_recipient_id uuid,
  p_key text,
  p_time_zone text default 'Australia/Sydney',
  p_limit integer default 100
)
returns setof public.notification_details
language sql
stable
set search_path = ''
as $$
  select d.*
  from public.notification_details d
  where d.recipient_id = p_recipient_id
    and public.can_act_as(p_recipient_id)
    and public.notification_group_key(d.type, d.id, d.post_id, (d.post ->> 'root_id')::uuid, d.event_id, d.created_at, p_time_zone) = p_key
  order by d.created_at desc, d.id desc
  limit least(greatest(p_limit, 1), 200)
$$;

-- The badge counts rows people will see: thirty likes on one post are one.
create or replace function public.unread_notification_count()
returns integer
language sql
stable
set search_path = ''
as $$
  select count(distinct public.notification_group_key(d.type, d.id, d.post_id, (d.post ->> 'root_id')::uuid, d.event_id, d.created_at, 'Australia/Sydney'))::integer
  from public.notification_details d
  where d.recipient_id = auth.uid() and d.read_at is null
$$;

-- Opening one tab reads only what that tab shows.
drop function public.mark_notifications_read(uuid);

create function public.mark_notifications_read(p_recipient_id uuid default null, p_types public.notification_type[] default null)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.notifications set read_at = now()
  where recipient_id = coalesce(p_recipient_id, auth.uid())
    and public.can_act_as(recipient_id) and read_at is null
    and (p_types is null or type = any (p_types))
$$;

-- A post that waited for review tells its author when it goes up. A post
-- published in the transaction that created it never waited, and a
-- deactivated account's posts come back without a notice.
create function public.notify_post_approved()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.created_at < now() then
    perform public.notify_moderation(
      new.author_id, new.id,
      'Your ' || case when new.parent_id is null then 'post' else 'reply' end || ' is up. Thanks for waiting.',
      null, null
    );
  end if;
  return null;
end;
$$;

create trigger posts_notify_approved after update of status on public.posts
  for each row when (old.status = 'pending' and new.status = 'published' and new.deleted_at is null)
  execute function public.notify_post_approved();

-- ---------------------------------------------------------------------------
-- 2. Blocks
-- ---------------------------------------------------------------------------

-- Blocking removes follows and likes both ways. Unblocking restores neither.
create or replace function public.handle_block()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.follows
  where (follower_id = new.blocker_id and followee_id = new.blocked_id)
     or (follower_id = new.blocked_id and followee_id = new.blocker_id);
  delete from public.likes l
  using public.posts p
  where p.id = l.post_id
    and ((l.user_id = new.blocker_id and new.blocked_id in (p.author_id, p.created_by))
      or (l.user_id = new.blocked_id and new.blocker_id in (p.author_id, p.created_by)));
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Messages: history and blocks
-- ---------------------------------------------------------------------------

-- People added to a group read from when they joined unless the person adding
-- them shares the history. Everyone there from the start reads everything.
alter table public.conversation_participants
  add column visible_from timestamptz not null default '-infinity';

-- The earliest message the viewer may read in a conversation, or null when
-- they may read none: they are not in it, or it is a direct conversation with
-- someone they have a block with.
create function public.message_visible_from(p_conversation_id uuid)
returns timestamptz
language sql
stable
security definer
set search_path = ''
as $$
  select cp.visible_from
  from public.conversation_participants cp
  join public.conversations c on c.id = cp.conversation_id
  where cp.conversation_id = p_conversation_id and cp.user_id = auth.uid() and cp.status <> 'declined'
    and not (c.kind = 'direct' and exists (
      select 1 from public.conversation_participants o
      where o.conversation_id = c.id and o.user_id <> cp.user_id and public.is_blocked_between(o.user_id, cp.user_id)
    ))
$$;

drop policy "Participants see conversations" on public.conversations;
create policy "Participants see conversations" on public.conversations for select to authenticated
  using (public.message_visible_from(id) is not null);

drop policy "Participants read messages" on public.messages;
create policy "Participants read messages from when they joined" on public.messages for select to authenticated
  using (created_at >= public.message_visible_from(conversation_id));

drop policy "Participants see reactions" on public.message_reactions;
create policy "Participants see reactions" on public.message_reactions for select to authenticated
  using (exists (
    select 1 from public.messages m
    where m.id = message_id and m.created_at >= public.message_visible_from(m.conversation_id)
  ));

-- A photo can be read by whoever can read the message it was sent in. The
-- messages table applies that rule itself.
drop policy "Participants read message attachments" on storage.objects;
create policy "Participants read message attachments" on storage.objects for select to authenticated
  using (
    bucket_id = 'message-media'
    and exists (
      select 1 from public.messages m
      where m.conversation_id = public.try_uuid((storage.foldername(name))[1]) and name = any (m.image_paths)
    )
  );

-- Replies can only point at messages the sender can read.
create or replace function public.check_message()
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
    if v_path !~ ('^' || new.conversation_id::text || '/[A-Za-z0-9_-]+\.webp$') then
      raise exception 'Invalid attachment' using errcode = '42501';
    end if;
  end loop;

  if new.reply_to_id is not null and not exists (
    select 1 from public.messages m
    where m.id = new.reply_to_id and m.conversation_id = new.conversation_id
      and m.created_at >= (
        select cp.visible_from from public.conversation_participants cp
        where cp.conversation_id = new.conversation_id and cp.user_id = new.sender_id
      )
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

-- Nobody is put in a group with someone they have a block with, whichever
-- side blocked. The message names the person without saying why.
create function public.check_group_blocks(p_conversation_id uuid, p_member_ids uuid[])
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_name text;
begin
  select p.display_name into v_name
  from unnest(p_member_ids) as m(id)
  join public.profiles p on p.id = m.id
  where exists (
    select 1 from public.conversation_participants o
    where o.conversation_id = p_conversation_id and o.status <> 'declined' and o.user_id <> m.id
      and public.is_blocked_between(o.user_id, m.id)
  ) or exists (
    select 1 from unnest(p_member_ids) as other(id)
    where other.id <> m.id and public.is_blocked_between(other.id, m.id)
  )
  limit 1;
  if v_name is not null then
    raise exception '% can''t be added to this group', v_name using errcode = '42501';
  end if;
end;
$$;

create or replace function public.create_group_conversation(p_title text, p_member_ids uuid[])
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
  perform public.check_group_blocks(null, v_members || v_me);

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

drop function public.add_group_members(uuid, uuid[]);

create function public.add_group_members(p_conversation_id uuid, p_member_ids uuid[], p_share_history boolean default false)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_member uuid;
  v_from timestamptz := case when p_share_history then '-infinity'::timestamptz else now() end;
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
  perform public.check_group_blocks(p_conversation_id, p_member_ids);

  foreach v_member in array p_member_ids loop
    if v_member <> auth.uid() then
      insert into public.conversation_participants (conversation_id, user_id, status, visible_from)
      values (p_conversation_id, v_member, public.initial_participant_status(auth.uid(), v_member), v_from)
      on conflict do nothing;
    end if;
  end loop;
end;
$$;

-- Unread counts and the preview stop at what the viewer may read, a direct
-- conversation across a block leaves both inboxes, and history_from says
-- where a later member's view of a group starts.
create or replace view public.conversation_list
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
    where m.conversation_id = c.id and m.created_at > me.last_read_at and m.created_at >= me.visible_from
      and m.sender_id is distinct from me.user_id and m.removed_at is null
  )::integer as unread_count,
  (
    select jsonb_build_object('body', left(m.body, 140), 'sender_id', m.sender_id, 'created_at', m.created_at,
      'images', cardinality(m.image_paths), 'removed', m.removed_at is not null)
    from public.messages m where m.conversation_id = c.id and m.created_at >= me.visible_from
    order by m.created_at desc limit 1
  ) as last_message,
  public.conversation_members(c.id) as members,
  me.visible_from as history_from
from public.conversations c
join public.conversation_participants me on me.conversation_id = c.id and me.user_id = auth.uid()
where me.status <> 'declined' and public.message_visible_from(c.id) is not null;

-- Requests count too: with no email or push, a request nobody is told about
-- can wait for weeks.
create or replace function public.unread_message_count()
returns integer
language sql
stable
security invoker
set search_path = ''
as $$
  select (
    (select coalesce(sum(unread_count), 0) from public.conversation_list where my_status = 'accepted' and archived_at is null and not muted)
    + (select count(*) from public.conversation_list where my_status = 'pending')
  )::integer
$$;

-- ---------------------------------------------------------------------------
-- 4. Rate limits
-- ---------------------------------------------------------------------------

-- One row per member and action: how many times in the current window.
-- Undoing an action gives nothing back.
create table public.rate_limits (
  user_id uuid not null references public.profiles (id) on delete cascade,
  action text not null,
  window_start timestamptz not null default now(),
  hits integer not null default 1,
  primary key (user_id, action)
);

alter table public.rate_limits enable row level security;

create function public.count_towards_limit(p_user_id uuid, p_action text, p_limit integer, p_window interval, p_message text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hits integer;
begin
  if p_user_id is null then
    return;
  end if;
  insert into public.rate_limits as r (user_id, action) values (p_user_id, p_action)
  on conflict (user_id, action) do update set
    window_start = case when r.window_start < now() - p_window then now() else r.window_start end,
    hits = case when r.window_start < now() - p_window then 1 else r.hits + 1 end
  returning hits into v_hits;
  if v_hits > p_limit then
    raise exception '%', p_message using errcode = '23514';
  end if;
end;
$$;

-- Trigger arguments: the column naming the member, the action, the limit per
-- minute and the message.
create function public.limit_per_minute()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.count_towards_limit((to_jsonb(new) ->> tg_argv[0])::uuid, tg_argv[1], tg_argv[2]::integer, interval '1 minute', tg_argv[3]);
  return new;
end;
$$;

create trigger follows_limit before insert on public.follows
  for each row execute function public.limit_per_minute('follower_id', 'follow', '30', 'You''re following people very quickly. Wait a minute and try again.');

create trigger likes_limit before insert on public.likes
  for each row execute function public.limit_per_minute('user_id', 'like', '60', 'You''re liking posts very quickly. Wait a minute and try again.');

create trigger saves_limit before insert on public.saves
  for each row execute function public.limit_per_minute('user_id', 'save', '60', 'You''re saving posts very quickly. Wait a minute and try again.');

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

revoke all on table public.rate_limits from public, anon, authenticated;
grant select, insert, update, delete on table public.rate_limits to service_role;

revoke all on function
  public.notification_group_key(public.notification_type, bigint, uuid, uuid, uuid, timestamptz, text),
  public.notification_groups(uuid, public.notification_type[], text, timestamptz, text, timestamptz, integer),
  public.notification_group_items(uuid, text, text, integer),
  public.mark_notifications_read(uuid, public.notification_type[]),
  public.notify_post_approved(),
  public.message_visible_from(uuid),
  public.check_group_blocks(uuid, uuid[]),
  public.add_group_members(uuid, uuid[], boolean),
  public.count_towards_limit(uuid, text, integer, interval, text),
  public.limit_per_minute()
from public, anon, authenticated;

-- The grouping functions run as the member, so they need the key function.
grant execute on function
  public.notification_group_key(public.notification_type, bigint, uuid, uuid, uuid, timestamptz, text),
  public.notification_groups(uuid, public.notification_type[], text, timestamptz, text, timestamptz, integer),
  public.notification_group_items(uuid, text, text, integer),
  public.mark_notifications_read(uuid, public.notification_type[]),
  public.message_visible_from(uuid),
  public.add_group_members(uuid, uuid[], boolean)
to authenticated;
