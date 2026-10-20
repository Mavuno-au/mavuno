-- Product metrics and service health for admins (/operations).
--
-- Activity is kept to the minimum the metrics need: the last day each member
-- used Mavuno (private, never shown or exposed through the API) and how many
-- members were active each day (a count, with no identities). Days follow
-- Sydney time, the same zone the app shows dates in before it knows the reader's.

create table public.member_activity (
  id uuid primary key references public.profiles (id) on delete cascade,
  last_seen date not null
);

create table public.active_member_counts (
  day date primary key,
  members integer not null check (members >= 0)
);

-- Neither table has policies, so only the SECURITY DEFINER functions below
-- can read or write them.
alter table public.member_activity enable row level security;
alter table public.active_member_counts enable row level security;

create index member_activity_last_seen_idx on public.member_activity (last_seen);

create function public.sydney_today()
returns date
language sql
stable
set search_path = ''
as $$
  select (now() at time zone 'Australia/Sydney')::date
$$;

-- Records that the signed-in member used Mavuno today. The app calls it at
-- most once a day per browser; repeated calls on the same day change nothing.
create function public.mark_seen()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_today date := public.sydney_today();
  v_id uuid := (select auth.uid());
begin
  if v_id is null or not exists (select 1 from public.profiles where id = v_id) then
    return;
  end if;
  insert into public.member_activity (id, last_seen) values (v_id, v_today)
  on conflict (id) do update set last_seen = excluded.last_seen
  where public.member_activity.last_seen < excluded.last_seen;
  if found then
    insert into public.active_member_counts (day, members) values (v_today, 1)
    on conflict (day) do update set members = public.active_member_counts.members + 1;
  end if;
end;
$$;

-- The product funnel, as counts; the page works out the shares. People only
-- (organisations are not sign-ups). A cohort is everyone who joined in the
-- last 30 days and has had their first full day.
create function public.admin_metrics()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_today date := public.sydney_today();
  v_result jsonb;
begin
  if not public.is_admin() then
    raise exception 'Only admins can see metrics' using errcode = '42501';
  end if;

  with people as (
    select p.id, p.created_at, (p.created_at at time zone 'Australia/Sydney')::date as joined, s.onboarded_at, a.last_seen
    from public.profiles p
    join public.profile_settings s on s.id = p.id
    left join public.member_activity a on a.id = p.id
    where p.account_type = 'person'
  ),
  cohort as (
    select * from people
    where created_at >= now() - interval '30 days' and created_at < now() - interval '1 day'
  ),
  first_day as (
    select
      c.id,
      exists (
        select 1 from public.posts po
        where po.created_by = c.id and po.deleted_at is null and po.created_at < c.created_at + interval '1 day'
      ) as posted,
      exists (
        select 1 from public.follows f
        where f.follower_id = c.id and f.created_at < c.created_at + interval '1 day'
      ) as followed,
      exists (
        select 1 from public.follows f
        join public.follows back on back.follower_id = f.followee_id and back.followee_id = c.id
        where f.follower_id = c.id
          and f.created_at < c.created_at + interval '1 day'
          and back.created_at < c.created_at + interval '7 days'
      ) as followed_back
    from cohort c
  ),
  top_level as (
    select po.id, po.created_by, po.published_at
    from public.posts po
    where po.parent_id is null and po.status = 'published' and po.deleted_at is null
      and po.published_at >= now() - interval '31 days' and po.published_at < now() - interval '1 day'
  ),
  days as (
    select generate_series(v_today - 29, v_today, interval '1 day')::date as day
  )
  select jsonb_build_object(
    'today', v_today,
    'signups', (
      select jsonb_build_object(
        'total', count(*),
        'today', count(*) filter (where joined = v_today),
        'last7', count(*) filter (where joined > v_today - 7),
        'previous7', count(*) filter (where joined <= v_today - 7 and joined > v_today - 14),
        'last30', count(*) filter (where joined > v_today - 30)
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
    'activation', (
      select jsonb_build_object(
        'cohort', count(*),
        'onboarded', count(*) filter (where c.onboarded_at is not null),
        'posted', count(*) filter (where d.posted),
        'followed', count(*) filter (where d.followed),
        'followedBack', count(*) filter (where d.followed_back)
      ) from cohort c join first_day d on d.id = c.id
    ),
    'retention', (
      select jsonb_agg(jsonb_build_object(
        'day', r.n,
        'eligible', (select count(*) from people where joined <= v_today - r.n and joined > v_today - r.n - 60),
        'returned', (select count(*) from people where joined <= v_today - r.n and joined > v_today - r.n - 60 and last_seen >= joined + r.n)
      ) order by r.n)
      from unnest(array[1, 7, 14]) as r(n)
    ),
    'answered', (
      select jsonb_build_object(
        'posts', count(*),
        'answered', count(*) filter (where exists (
          select 1 from public.posts reply
          where reply.parent_id = t.id and reply.status = 'published' and reply.deleted_at is null
            and reply.created_by is distinct from t.created_by
            and reply.created_at < t.published_at + interval '1 day'
        ))
      ) from top_level t
    ),
    'daily', (
      select jsonb_agg(jsonb_build_object(
        'day', d.day,
        'active', coalesce((select members from public.active_member_counts where day = d.day), 0),
        'signups', (select count(*) from people where joined = d.day),
        'posts', (
          select count(*) from public.posts po
          where po.status = 'published' and po.deleted_at is null
            and (po.created_at at time zone 'Australia/Sydney')::date = d.day
        )
      ) order by d.day)
      from days d
    )
  ) into v_result;

  return v_result;
end;
$$;

-- Whether the service is keeping up: moderation backlogs, background jobs
-- that have fallen behind, and the last day's traffic.
create function public.admin_health()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Only admins can see service health' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'checkedAt', now(),
    'openReports', (select count(*) from public.reports where status = 'open'),
    'oldestOpenReport', (select min(created_at) from public.reports where status = 'open'),
    'awaitingReview', (
      (select count(*) from public.posts where status = 'pending' and deleted_at is null)
      + (select count(*) from public.events where status = 'pending')
      + (select count(*) from public.opportunities where status = 'pending')
    ),
    'oldestAwaitingReview', (select min(created_at) from public.posts where status = 'pending' and deleted_at is null),
    'suspended', (select count(*) from public.profile_settings where suspended_until > now()),
    -- Deleted posts are erased within a minute by pg_cron; anything older
    -- than five minutes means the job has stopped.
    'purgeBacklog', (select count(*) from public.deleted_post_contents where deleted_at < now() - interval '5 minutes'),
    'storageBacklog', (select count(*) from public.storage_cleanup where created_at < now() - interval '1 day'),
    'lastDay', jsonb_build_object(
      'signups', (select count(*) from public.profiles where account_type = 'person' and created_at > now() - interval '1 day'),
      'posts', (select count(*) from public.posts where status = 'published' and deleted_at is null and created_at > now() - interval '1 day'),
      'messages', (select count(*) from public.messages where removed_at is null and created_at > now() - interval '1 day'),
      'reports', (select count(*) from public.reports where created_at > now() - interval '1 day')
    )
  );
end;
$$;

-- The export includes the last day a member was seen.
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

revoke all on table public.member_activity, public.active_member_counts from public, anon, authenticated;
grant all on table public.member_activity, public.active_member_counts to service_role;

revoke all on function public.sydney_today(), public.mark_seen(), public.admin_metrics(), public.admin_health() from public, anon, authenticated;
grant execute on function public.mark_seen(), public.admin_metrics(), public.admin_health() to authenticated;
