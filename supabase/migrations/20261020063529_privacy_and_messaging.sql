-- Privacy fixes for messages and likes, image descriptions on messages, a
-- "can I message this person" check, and a fuller data export.

-- ---------------------------------------------------------------------------
-- Participants see only their own row
-- ---------------------------------------------------------------------------

-- Other people's status, read position, archive and mute settings stay
-- private. What the app shows about them comes from conversation_members,
-- where a declined request looks the same as one still waiting.
drop policy "Participants see each other" on public.conversation_participants;
create policy "People see their own participation" on public.conversation_participants for select to authenticated
  using (user_id = (select auth.uid()));

-- Read times are only shared once someone has accepted, so declining a request
-- (which marks it read) never shows up as "Seen".
create or replace function public.shared_read_at(p_conversation_id uuid, p_user_id uuid)
returns timestamptz
language sql
stable
security definer
set search_path = ''
as $$
  select cp.last_read_at
  from public.conversation_participants cp
  where cp.conversation_id = p_conversation_id and cp.user_id = p_user_id and cp.status = 'accepted'
    and public.is_participant(p_conversation_id)
    and (select read_receipts from public.profile_settings where id = p_user_id)
    and (select read_receipts from public.profile_settings where id = auth.uid())
$$;

create function public.conversation_members(p_conversation_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', p.id, 'username', p.username, 'display_name', p.display_name, 'avatar_url', p.avatar_url,
    'colour', public.profile_colour(p.colour, p.id),
    'status', case when cp.status = 'accepted' then 'accepted' else 'pending' end,
    'role', cp.role, 'joined_at', cp.joined_at,
    'read_at', public.shared_read_at(p_conversation_id, cp.user_id)
  ) order by cp.joined_at), '[]'::jsonb)
  from public.conversation_participants cp
  join public.profiles p on p.id = cp.user_id
  where cp.conversation_id = p_conversation_id and cp.user_id <> auth.uid()
    and public.is_participant(p_conversation_id)
$$;

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
    where m.conversation_id = c.id and m.created_at > me.last_read_at
      and m.sender_id is distinct from me.user_id and m.removed_at is null
  )::integer as unread_count,
  (
    select jsonb_build_object('body', left(m.body, 140), 'sender_id', m.sender_id, 'created_at', m.created_at,
      'images', cardinality(m.image_paths), 'removed', m.removed_at is not null)
    from public.messages m where m.conversation_id = c.id
    order by m.created_at desc limit 1
  ) as last_message,
  public.conversation_members(c.id) as members
from public.conversations c
join public.conversation_participants me on me.conversation_id = c.id and me.user_id = auth.uid()
where me.status <> 'declined';

-- ---------------------------------------------------------------------------
-- Likes are private to the person who liked
-- ---------------------------------------------------------------------------

-- like_count carries the totals and post_details.liked reads only the
-- viewer's own like.
drop policy "Likes are public" on public.likes;
create policy "People see their own likes" on public.likes for select to authenticated
  using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Image descriptions on messages
-- ---------------------------------------------------------------------------

-- One description per image, or none at all. The array is at most three long
-- (image_paths is), so each element is checked by position.
alter table public.messages
  add column image_alts text[] not null default '{}',
  add constraint messages_image_alts_check check (
    cardinality(image_alts) in (0, cardinality(image_paths))
    and (cardinality(image_alts) = 0 or (array_ndims(image_alts) = 1 and array_lower(image_alts, 1) = 1))
    and array_position(image_alts, null) is null
    and coalesce(char_length(image_alts[1]), 0) <= 1000
    and coalesce(char_length(image_alts[2]), 0) <= 1000
    and coalesce(char_length(image_alts[3]), 0) <= 1000
  );

grant insert (image_alts) on public.messages to authenticated;

-- A message a moderator removes loses its images, and their descriptions with them.
create function public.clear_removed_message_alts()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.image_alts := '{}';
  return new;
end;
$$;

create trigger messages_clear_removed_alts before update of removed_at on public.messages
  for each row when (new.removed_at is not null) execute function public.clear_removed_message_alts();

-- ---------------------------------------------------------------------------
-- Whether the viewer can message someone
-- ---------------------------------------------------------------------------

-- The same answer start_direct_conversation would give, without starting
-- anything: an existing conversation always opens, otherwise the recipient's
-- contact rules decide.
create function public.can_message(p_user_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
begin
  if v_me is null or p_user_id is null or p_user_id = v_me or not public.is_active_member()
    or public.is_blocked_between(v_me, p_user_id) then
    return false;
  end if;
  if exists (
    select 1 from public.conversations
    where direct_key = least(v_me::text, p_user_id::text) || ':' || greatest(v_me::text, p_user_id::text)
  ) then
    return true;
  end if;
  perform public.initial_participant_status(v_me, p_user_id);
  return true;
exception
  when check_violation or insufficient_privilege then
    return false;
end;
$$;

-- ---------------------------------------------------------------------------
-- Data export
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
    'organisations', (select coalesce(jsonb_agg(jsonb_build_object('username', o.username, 'role', m.role, 'since', m.created_at)), '[]')
      from public.organisation_members m join public.profiles o on o.id = m.org_id where m.user_id = auth.uid()),
    'posts', (select coalesce(jsonb_agg(to_jsonb(p) - 'hot_score' order by p.created_at), '[]')
      from public.posts p where p.created_by = auth.uid() and p.deleted_at is null),
    'post_images', (select coalesce(jsonb_agg(jsonb_build_object('post_id', i.post_id, 'url', i.url, 'alt', i.alt_text)), '[]')
      from public.post_images i join public.posts p on p.id = i.post_id where p.created_by = auth.uid()),
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
      from public.notifications n left join public.profiles a on a.id = n.actor_id where n.recipient_id = auth.uid())
  )
  where auth.uid() is not null
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

revoke all on function public.conversation_members(uuid) from public, anon;
revoke all on function public.can_message(uuid) from public, anon;
revoke all on function public.clear_removed_message_alts() from public, anon, authenticated;
grant execute on function public.conversation_members(uuid) to authenticated;
grant execute on function public.can_message(uuid) to authenticated;
grant execute on function public.export_my_data() to authenticated;
