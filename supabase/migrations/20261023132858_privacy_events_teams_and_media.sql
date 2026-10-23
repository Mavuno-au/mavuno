-- Privacy gaps found in a full review on 23 October 2026.
--
-- 1. Anyone, guests and blocked people included, could list every event a
--    member was going to, with its address and time, straight from
--    event_rsvps. The going list on an event page ignored blocks and mutes.
-- 2. An online event's link was readable by anyone, though hosts are told
--    only people going see it.
-- 3. Events and opportunities from someone the viewer has a block with still
--    showed in their lists.
-- 4. Team invitations nobody had accepted were public, so an organisation
--    could put anyone's name to itself.
-- 5. Guests could list the public media bucket, which found photos on posts
--    that were removed, held or still scheduled.
-- 6. The profile of an account deactivated as under 16 stayed public for the
--    30 days before it is deleted.

-- ---------------------------------------------------------------------------
-- 1. RSVPs are the member's own; the going list comes from a function
-- ---------------------------------------------------------------------------

alter policy "RSVPs are visible with their event" on public.event_rsvps
  to authenticated
  using (
    user_id = (select auth.uid())
    or (select public.is_moderator())
    or exists (select 1 from public.events e where e.id = event_id and public.can_act_as(e.host_id))
  );
alter policy "RSVPs are visible with their event" on public.event_rsvps rename to "People see their own RSVPs, hosts see their event's";
revoke select on public.event_rsvps from anon;

-- The faces under "Going" on an event: members only, never people the viewer
-- has a block with, has muted, or who are kept out of lists of people.
create function public.event_attendees(p_event_id uuid, p_limit integer default 12)
returns setof public.profiles
language sql
stable
security definer
set search_path = ''
as $$
  select p.*
  from public.event_rsvps r
  join public.events e on e.id = r.event_id
  join public.profiles p on p.id = r.user_id
  where r.event_id = p_event_id
    and r.status = 'going'
    and (e.status = 'published' or public.can_act_as(e.host_id) or public.is_moderator())
    and public.is_listed(p.id)
    and not public.is_blocked_with_viewer(p.id)
    and not public.is_muted_by_viewer(p.id)
  order by r.created_at, r.user_id
  limit least(greatest(p_limit, 1), 50)
$$;

revoke execute on function public.event_attendees(uuid, integer) from public, anon;
grant execute on function public.event_attendees(uuid, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. The online link only for the host's team, people going and moderators
-- ---------------------------------------------------------------------------

revoke select on public.events from anon, authenticated;
grant select (
  id, host_id, created_by, status, title, description, category, format, starts_at, ends_at, timezone,
  city_id, venue_name, address, ticket_url, cover_url, is_free, capacity, space_id, going_count,
  interested_count, rejection_reason, cancelled_at, created_at
) on public.events to anon, authenticated;

create function public.event_online_url(p_event_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select e.online_url
  from public.events e
  where e.id = p_event_id
    and (
      public.can_act_as(e.host_id)
      or public.is_moderator()
      or (
        e.status = 'published'
        and exists (select 1 from public.event_rsvps r where r.event_id = e.id and r.user_id = auth.uid() and r.status = 'going')
      )
    )
$$;

revoke execute on function public.event_online_url(uuid) from public, anon;
grant execute on function public.event_online_url(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Blocks reach events and opportunities
-- ---------------------------------------------------------------------------

alter policy "Published events are public" on public.events
  using ((status = 'published' and not public.is_blocked_with_viewer(host_id)) or public.can_act_as(host_id) or (select public.is_moderator()));

alter policy "Published opportunities are public" on public.opportunities
  using ((status = 'published' and not public.is_blocked_with_viewer(poster_id)) or public.can_act_as(poster_id) or (select public.is_moderator()));

-- ---------------------------------------------------------------------------
-- 4. A team is the people who accepted
-- ---------------------------------------------------------------------------

alter policy "Organisation teams are public" on public.organisation_members
  using (accepted_at is not null or user_id = (select auth.uid()) or public.can_manage_org(org_id));

-- ---------------------------------------------------------------------------
-- 5. Files are served by address; listing is for the people they belong to
-- ---------------------------------------------------------------------------

drop policy "Media is public" on storage.objects;
create policy "People list media for profiles they act as" on storage.objects for select to authenticated
  using (bucket_id = 'media' and public.can_act_as(public.try_uuid((storage.foldername(name))[1])));

-- ---------------------------------------------------------------------------
-- 6. Profiles deactivated as under 16 are gone from view
-- ---------------------------------------------------------------------------

-- Says only what the missing profile page already shows. Pages and the app
-- call it before showing someone else's profile.
create function public.profile_hidden(p_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.profile_settings s where s.id = p_profile_id and s.age_deactivated_at is not null)
    and p_profile_id is distinct from auth.uid()
    and not public.is_moderator()
$$;

revoke execute on function public.profile_hidden(uuid) from public;
grant execute on function public.profile_hidden(uuid) to anon, authenticated;
