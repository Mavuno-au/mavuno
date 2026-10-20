-- Fuller product metrics, an activity view and more health checks for admins
-- (/operations). Everything stays a count, apart from the busiest authors,
-- which are public profiles counted by their public posts.

-- The rates of the people who joined, and the posts published, on the Sydney
-- days p_from to p_to. admin_metrics() calls it for the chosen range and the
-- one before, so every rate can show how it moved.
create function public.metric_rates(p_from date, p_to date)
returns jsonb
language sql
stable
set search_path = ''
as $$
  with bounds as (
    select
      (p_from::timestamp at time zone 'Australia/Sydney') as starts,
      ((p_to + 1)::timestamp at time zone 'Australia/Sydney') as ends,
      public.sydney_today() as today,
      -- Visits before tracking started left no trace, so a day N before it
      -- would read as someone who never came back.
      (select min(day) from public.active_member_counts) as tracked_since
  ),
  people as (
    select p.id, p.created_at, (p.created_at at time zone 'Australia/Sydney')::date as joined, s.onboarded_at, a.last_seen
    from public.profiles p
    join public.profile_settings s on s.id = p.id
    left join public.member_activity a on a.id = p.id
    where p.account_type = 'person'
  ),
  signups as (
    select people.* from people, bounds b where people.created_at >= b.starts and people.created_at < b.ends
  ),
  -- Activation is value received within 12 hours, as a reader or an author.
  -- Posting alone gives value rather than receiving it, so it doesn't count.
  newcomers as (
    select s.id, s.joined, s.created_at + interval '12 hours' as until
    from signups s
    where s.created_at <= now() - interval '12 hours'
  ),
  activated as (
    select v.joined, (
      -- Reader: liked or saved posts by 3 or more different people. Counting
      -- people rather than likes means the feed showed several, not one friend.
      (
        select count(distinct po.created_by) from public.posts po
        where po.created_by <> v.id and po.id in (
          select l.post_id from public.likes l where l.user_id = v.id and l.created_at <= v.until
          union all
          select sv.post_id from public.saves sv where sv.user_id = v.id and sv.created_at <= v.until
        )
      ) >= 3
      -- Author: posted, and someone else replied, quoted or liked it.
      or exists (
        select 1 from public.posts mine
        where mine.created_by = v.id and mine.created_at <= v.until and (
          exists (
            select 1 from public.likes l
            where l.post_id = mine.id and l.user_id <> v.id and l.created_at <= v.until
          )
          or exists (
            select 1 from public.posts r
            where (r.parent_id = mine.id or r.quote_id = mine.id) and r.created_by <> v.id
              and r.status = 'published' and r.deleted_at is null and r.created_at <= v.until
          )
        )
      )
    ) as activated
    from newcomers v
  ),
  first_day as (
    select
      s.onboarded_at is not null as onboarded,
      exists (
        select 1 from public.posts po
        where po.created_by = s.id and po.deleted_at is null and po.created_at < s.created_at + interval '1 day'
      ) as posted,
      (
        select count(*) from public.follows f
        where f.follower_id = s.id and f.created_at < s.created_at + interval '1 day'
      ) as follows,
      exists (
        select 1 from public.follows f
        join public.follows back on back.follower_id = f.followee_id and back.followee_id = s.id
        where f.follower_id = s.id
          and f.created_at < s.created_at + interval '1 day'
          and back.created_at < s.created_at + interval '7 days'
      ) as followed_back
    from signups s
    where s.created_at <= now() - interval '1 day'
  ),
  -- A post is answered when someone else replies, quotes or likes it within a
  -- day. A newcomer who posts into silence rarely posts again.
  top_level as (
    select
      t.id,
      t.published_at,
      not exists (
        select 1 from public.posts e where e.created_by = t.created_by and e.created_at < t.created_at
      ) as first_post,
      (
        select min(answer.at) from (
          select r.created_at as at from public.posts r
          where (r.parent_id = t.id or r.quote_id = t.id) and r.created_by <> t.created_by
            and r.status = 'published' and r.deleted_at is null
          union all
          select l.created_at from public.likes l where l.post_id = t.id and l.user_id <> t.created_by
        ) answer
        where answer.at < t.published_at + interval '1 day'
      ) as answered_at
    from public.posts t, bounds b
    where t.parent_id is null and t.status = 'published' and t.deleted_at is null and t.created_by is not null
      and t.published_at >= b.starts and t.published_at < b.ends and t.published_at <= now() - interval '1 day'
  )
  select jsonb_build_object(
    'signups', (select count(*) from signups),
    'activation', (
      select jsonb_build_object('eligible', count(*), 'activated', count(*) filter (where activated)) from activated
    ),
    'activationByDay', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'day', a.joined,
        'eligible', a.eligible,
        'activated', a.activated,
        -- A day is complete once its last sign-ups are 12 hours old.
        'complete', ((a.joined + 1)::timestamp at time zone 'Australia/Sydney') + interval '12 hours' <= now()
      ) order by a.joined), '[]'::jsonb)
      from (
        select joined, count(*) as eligible, count(*) filter (where activated) as activated from activated group by joined
      ) a
    ),
    'firstDay', (
      select jsonb_build_object(
        'eligible', count(*),
        'onboarded', count(*) filter (where onboarded),
        'posted', count(*) filter (where posted),
        'followed', count(*) filter (where follows > 0),
        'followedBack', count(*) filter (where followed_back),
        'medianFollows', percentile_cont(0.5) within group (order by follows)
      ) from first_day
    ),
    'answered', (
      select jsonb_build_object(
        'posts', count(*),
        'answered', count(*) filter (where answered_at is not null),
        'medianMinutes', percentile_cont(0.5) within group (order by extract(epoch from answered_at - published_at) / 60)
          filter (where answered_at is not null),
        'firstPosts', count(*) filter (where first_post),
        'firstAnswered', count(*) filter (where first_post and answered_at is not null)
      ) from top_level
    ),
    -- Day N has to be over, so nobody counts as gone on a day they may still
    -- come back. Based on the last day seen: "still coming back after N days".
    'retention', (
      select jsonb_agg(jsonb_build_object(
        'day', r.n,
        'eligible', (
          select count(*) from people, bounds b
          where people.joined + r.n between greatest(p_from, coalesce(b.tracked_since, b.today)) and least(p_to, b.today - 1)
        ),
        'returned', (
          select count(*) from people, bounds b
          where people.joined + r.n between greatest(p_from, coalesce(b.tracked_since, b.today)) and least(p_to, b.today - 1)
            and people.last_seen >= people.joined + r.n
        )
      ) order by r.n)
      from unnest(array[1, 7, 14]) as r(n)
    )
  )
$$;

-- The product funnel over the last 7 or 30 Sydney days, with the same rates
-- for the period before. Counts only; the page works out shares and changes.
drop function public.admin_metrics();

create function public.admin_metrics(p_days integer default 30)
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
    select p.id, (p.created_at at time zone 'Australia/Sydney')::date as joined, a.last_seen
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
        'previousRange', count(*) filter (where joined < v_from and joined >= v_from - p_days)
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

-- What happened today against yesterday, and over the last 7 or 30 Sydney
-- days by status and by author.
create function public.admin_activity(p_days integer default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_today date := public.sydney_today();
  v_today_starts timestamptz := v_today::timestamp at time zone 'Australia/Sydney';
  v_yesterday_starts timestamptz := (v_today - 1)::timestamp at time zone 'Australia/Sydney';
  v_starts timestamptz := (v_today - p_days + 1)::timestamp at time zone 'Australia/Sydney';
begin
  if not public.is_admin() then
    raise exception 'Only admins can see activity' using errcode = '42501';
  end if;
  if p_days is null or p_days not in (7, 30) then
    raise exception 'Choose 7 or 30 days' using errcode = '22023';
  end if;

  return jsonb_build_object(
    'today', v_today,
    'days', p_days,
    'compare', (
      select jsonb_object_agg(c.name, jsonb_build_object('today', c.today, 'yesterday', c.yesterday))
      from (
        select 'posts' as name,
          count(*) filter (where created_at >= v_today_starts) as today,
          count(*) filter (where created_at < v_today_starts) as yesterday
        from public.posts
        where parent_id is null and status = 'published' and deleted_at is null and created_at >= v_yesterday_starts
        union all
        select 'replies',
          count(*) filter (where created_at >= v_today_starts),
          count(*) filter (where created_at < v_today_starts)
        from public.posts
        where parent_id is not null and status = 'published' and deleted_at is null and created_at >= v_yesterday_starts
        union all
        select 'signups',
          count(*) filter (where created_at >= v_today_starts),
          count(*) filter (where created_at < v_today_starts)
        from public.profiles
        where account_type = 'person' and created_at >= v_yesterday_starts
        union all
        select 'messages',
          count(*) filter (where created_at >= v_today_starts),
          count(*) filter (where created_at < v_today_starts)
        from public.messages
        where removed_at is null and created_at >= v_yesterday_starts
        union all
        select 'reports',
          count(*) filter (where created_at >= v_today_starts),
          count(*) filter (where created_at < v_today_starts)
        from public.reports
        where created_at >= v_yesterday_starts
      ) c
    ),
    -- Posts and replies written in the range, deleted ones included, in a
    -- fixed order with the empty ones kept.
    'statuses', (
      select jsonb_agg(jsonb_build_object('status', s.status, 'count', coalesce(n.count, 0)) order by s.position)
      from (values ('published', 1), ('pending', 2), ('rejected', 3), ('deleted', 4)) as s(status, position)
      left join (
        select case when deleted_at is not null then 'deleted' else status::text end as status, count(*) as count
        from public.posts
        where created_at >= v_starts
        group by 1
      ) n on n.status = s.status
    ),
    -- Only published posts count, so the list shows nothing a visitor to the
    -- profile couldn't count themselves.
    'authors', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'username', a.username, 'displayName', a.display_name, 'posts', a.posts
      ) order by a.posts desc, a.username), '[]'::jsonb)
      from (
        select p.username, p.display_name, count(*) as posts
        from public.posts po
        join public.profiles p on p.id = po.author_id
        where po.status = 'published' and po.deleted_at is null and po.created_at >= v_starts
        group by p.id
        order by posts desc, p.username
        limit 10
      ) a
    )
  );
end;
$$;

-- pg_cron's run history, readable only by the role that scheduled the jobs, so
-- this runs as the owner. Null where pg_cron isn't installed (the tests, or a
-- project that schedules /api/maintenance instead).
create function public.cron_health()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  if to_regclass('cron.job_run_details') is null or to_regclass('cron.job') is null then
    return null;
  end if;
  -- job_run_details only has an index on runid and grows by a few thousand
  -- rows a day, so read the newest runs by runid instead of scanning it all.
  -- 10,000 covers more than three days of the current jobs.
  execute $query$
    with recent as (
      select jobid, status, return_message, start_time
      from cron.job_run_details
      order by runid desc
      limit 10000
    )
    select coalesce(jsonb_agg(jsonb_build_object(
      'name', j.jobname,
      'schedule', j.schedule,
      'active', j.active,
      'lastRun', last.start_time,
      'lastStatus', last.status,
      'failedLastDay', (
        select count(*) from recent d
        where d.jobid = j.jobid and d.status = 'failed' and d.start_time > now() - interval '1 day'
      ),
      'lastError', (
        select left(d.return_message, 300) from recent d
        where d.jobid = j.jobid and d.status = 'failed' and d.start_time > now() - interval '1 day'
        order by d.start_time desc
        limit 1
      )
    ) order by j.jobname), '[]'::jsonb)
    from cron.job j
    left join lateral (
      select d.start_time, d.status from recent d where d.jobid = j.jobid order by d.start_time desc limit 1
    ) last on true
  $query$ into v_result;
  return v_result;
exception when insufficient_privilege then
  return null;
end;
$$;

-- Whether the service is keeping up: moderation backlogs, background jobs
-- that have fallen behind or failed, and the last day's traffic.
create or replace function public.admin_health()
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
    -- Scheduled posts go out within a minute of their time.
    'overdueScheduled', (
      select count(*) from public.scheduled_posts where submitted_at is null and scheduled_at < now() - interval '5 minutes'
    ),
    'oldestOverdueScheduled', (
      select min(scheduled_at) from public.scheduled_posts where submitted_at is null and scheduled_at < now() - interval '5 minutes'
    ),
    -- Accounts deactivated for being under 16 are deleted after 30 days by a
    -- daily job, so one still here a day after that means the job has stopped.
    'ageDeactivated', (select count(*) from public.profile_settings where age_deactivated_at is not null),
    'agePurgeOverdue', (
      select count(*) from public.profile_settings where age_deactivated_at < now() - interval '31 days'
    ),
    'nextAgePurge', (
      select min(age_deactivated_at) + interval '30 days' from public.profile_settings where age_deactivated_at is not null
    ),
    'cron', public.cron_health(),
    'lastDay', jsonb_build_object(
      'signups', (select count(*) from public.profiles where account_type = 'person' and created_at > now() - interval '1 day'),
      'posts', (select count(*) from public.posts where status = 'published' and deleted_at is null and created_at > now() - interval '1 day'),
      'messages', (select count(*) from public.messages where removed_at is null and created_at > now() - interval '1 day'),
      'reports', (select count(*) from public.reports where created_at > now() - interval '1 day')
    )
  );
end;
$$;

revoke all on function public.metric_rates(date, date), public.cron_health() from public, anon, authenticated;
revoke all on function public.admin_metrics(integer), public.admin_activity(integer) from public, anon, authenticated;
grant execute on function public.admin_metrics(integer), public.admin_activity(integer) to authenticated;
