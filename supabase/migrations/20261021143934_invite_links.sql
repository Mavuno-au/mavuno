-- Personal invite links. Each member's link is /join/<username>. Someone who
-- joins through it is recorded with who invited them, the two follow each
-- other, and the inviter is told so they can say welcome. Only those two can
-- read the record; Operations counts invited sign-ups without naming anyone.
--
-- An email sign-up carries the inviter's username in its metadata and is
-- recorded when the address is confirmed, so an account nobody confirmed
-- never makes anyone follow it. Google has no metadata to carry, so the
-- callback calls accept_invite straight after the account is created.
--
-- The new enum value is only used inside plpgsql bodies here, which are read
-- when they run, after this migration has committed.

alter type public.notification_type add value if not exists 'joined';

create table public.invites (
  -- The person who joined: one inviter each, recorded once.
  member_id uuid primary key references public.profiles (id) on delete cascade,
  -- Cleared when the inviter's account is deleted, so the count of invited
  -- sign-ups doesn't change and nothing about the inviter stays.
  invited_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  check (member_id <> invited_by)
);

create index invites_invited_by_idx on public.invites (invited_by);

alter table public.invites enable row level security;

-- Written only by record_invite, so there is no insert, update or delete policy.
create policy "The two people in an invite see it" on public.invites for select to authenticated
  using (member_id = (select auth.uid()) or invited_by = (select auth.uid()));

-- Internal. Ignores anything that doesn't fit: an unknown or organisation
-- username, an inviter who is suspended, banned or deactivated, a block
-- between the two, a member who already has an inviter or hasn't confirmed
-- their age.
create function public.record_invite(p_member_id uuid, p_username text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inviter uuid;
begin
  select p.id into v_inviter
  from public.profiles p
  join public.profile_settings s on s.id = p.id
  where p.username = lower(trim(p_username))
    and p.account_type = 'person'
    and p.id <> p_member_id
    and s.banned_at is null
    and (s.suspended_until is null or s.suspended_until < now())
    and s.age_deactivated_at is null;

  if v_inviter is null
     or public.is_blocked_between(p_member_id, v_inviter)
     or exists (select 1 from public.invites where member_id = p_member_id)
     or not exists (
       select 1 from public.profile_settings s
       where s.id = p_member_id and s.age_confirmed_at is not null and s.age_deactivated_at is null
     ) then
    return;
  end if;

  insert into public.invites (member_id, invited_by) values (p_member_id, v_inviter);
  insert into public.follows (follower_id, followee_id)
  values (p_member_id, v_inviter), (v_inviter, p_member_id)
  on conflict do nothing;
  -- The inviter hears "joined from your invite" instead of "followed you".
  delete from public.notifications where recipient_id = v_inviter and actor_id = p_member_id and type = 'follow';
  perform public.notify(v_inviter, p_member_id, 'joined');
end;
$$;

-- Confirming an email address must never fail because of an invite (the
-- inviter's follow limit, say), so anything that goes wrong only loses the invite.
create function public.handle_confirmed_invite()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.email_confirmed_at is not null
     and (tg_op = 'INSERT' or old.email_confirmed_at is null)
     and nullif(new.raw_user_meta_data ->> 'invited_by', '') is not null then
    begin
      perform public.record_invite(new.id, new.raw_user_meta_data ->> 'invited_by');
    exception when others then
      null;
    end;
  end if;
  return new;
end;
$$;

-- Named to run after on_auth_user_created, which makes the profile.
create trigger on_auth_user_invited after insert or update of email_confirmed_at on auth.users
  for each row execute function public.handle_confirmed_invite();

-- For Google sign-ups, from /auth/callback. Invite links are public, so only
-- an account made in the last hour can take one: an existing member can't be
-- made to follow, or be followed by, whoever they like.
create function public.accept_invite(p_username text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and account_type = 'person' and created_at > now() - interval '1 hour'
  ) then
    return;
  end if;
  perform public.record_invite((select auth.uid()), p_username);
end;
$$;

-- ---------------------------------------------------------------------------
-- Operations: how many sign-ups came from an invite, never who
-- ---------------------------------------------------------------------------

create or replace function public.admin_metrics(p_days integer default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_today date := public.sydney_today();
  v_from date;
  v_result jsonb;
begin
  if not public.is_admin() then
    raise exception 'Only admins can see metrics' using errcode = '42501';
  end if;
  if p_days is null or p_days not in (7, 30) then
    raise exception 'Choose 7 or 30 days' using errcode = '22023';
  end if;
  v_from := v_today - p_days + 1;

  with people as (
    select
      p.id,
      (p.created_at at time zone 'Australia/Sydney')::date as joined,
      a.last_seen,
      exists (select 1 from public.invites i where i.member_id = p.id) as invited
    from public.profiles p
    left join public.member_activity a on a.id = p.id
    where p.account_type = 'person'
  )
  select jsonb_build_object(
    'today', v_today,
    'days', p_days,
    'signups', (
      select jsonb_build_object(
        'total', count(*),
        'today', count(*) filter (where joined = v_today),
        'range', count(*) filter (where joined >= v_from),
        'previousRange', count(*) filter (where joined < v_from and joined >= v_from - p_days),
        'invited', count(*) filter (where joined >= v_from and invited),
        'invitedTotal', count(*) filter (where invited)
      ) from people
    ),
    'active', (
      select jsonb_build_object(
        'day', count(*) filter (where last_seen = v_today),
        'week', count(*) filter (where last_seen > v_today - 7),
        'month', count(*) filter (where last_seen > v_today - 30),
        'postedMonth', count(*) filter (
          where last_seen > v_today - 30 and exists (
            select 1 from public.posts po
            where po.created_by = people.id and po.status = 'published' and po.deleted_at is null
              and po.created_at > now() - interval '30 days'
          )
        )
      ) from people
    ),
    'current', public.metric_rates(v_from, v_today),
    'previous', public.metric_rates(v_from - p_days, v_from - 1) - 'activationByDay',
    'daily', (
      select jsonb_agg(jsonb_build_object(
        'day', d.day,
        'active', coalesce((select members from public.active_member_counts where day = d.day), 0),
        'signups', (select count(*) from people where joined = d.day),
        'posts', (
          select count(*) from public.posts po
          where po.status = 'published' and po.deleted_at is null
            and po.created_at >= (d.day::timestamp at time zone 'Australia/Sydney')
            and po.created_at < ((d.day + 1)::timestamp at time zone 'Australia/Sydney')
        )
      ) order by d.day)
      from (select generate_series(v_from, v_today, interval '1 day')::date as day) d
    )
  ) into v_result;

  return v_result;
end;
$$;

-- ---------------------------------------------------------------------------
-- The export names who invited the member and whom they invited
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
      from public.notifications n left join public.profiles a on a.id = n.actor_id where n.recipient_id = auth.uid())
  )
  where auth.uid() is not null
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

revoke all on table public.invites from public, anon, authenticated;
grant select on table public.invites to authenticated;
grant all on table public.invites to service_role;

revoke all on function
  public.record_invite(uuid, text),
  public.handle_confirmed_invite(),
  public.accept_invite(text),
  public.admin_metrics(integer),
  public.export_my_data()
from public, anon, authenticated;

grant execute on function
  public.accept_invite(text),
  public.admin_metrics(integer),
  public.export_my_data()
to authenticated;
