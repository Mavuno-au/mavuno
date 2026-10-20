-- Community spaces, events and opportunities.
--
-- Events and opportunities share the moderation lifecycle of posts: they are
-- 'pending' until approved, unless the creator has a good reputation (see the
-- moderation migration), and only 'published' ones are public.

create type public.content_status as enum ('pending', 'published', 'rejected');
create type public.space_kind as enum ('city', 'interest');
create type public.space_role as enum ('owner', 'moderator', 'member');
create type public.event_category as enum (
  'community', 'networking', 'cultural', 'faith', 'sport', 'workshop', 'family', 'music', 'food', 'other'
);
create type public.event_format as enum ('in_person', 'online', 'hybrid');
create type public.rsvp_status as enum ('going', 'interested');
create type public.opportunity_type as enum (
  'job', 'internship', 'scholarship', 'grant', 'mentoring', 'business', 'volunteering'
);

-- ---------------------------------------------------------------------------
-- Spaces
-- ---------------------------------------------------------------------------

create table public.spaces (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]{2,40}$'),
  name text not null check (char_length(name) between 2 and 60),
  description text not null default '' check (char_length(description) <= 500),
  kind public.space_kind not null,
  city_id smallint references public.cities (id) on delete set null,
  emoji text check (char_length(emoji) <= 16),
  is_official boolean not null default false,
  created_by uuid references public.profiles (id) on delete set null,
  members_count integer not null default 0,
  posts_count integer not null default 0,
  last_post_at timestamptz,
  created_at timestamptz not null default now(),
  check (kind <> 'city' or city_id is not null)
);

create index spaces_kind_idx on public.spaces (kind, members_count desc);
create index spaces_name_trgm_idx on public.spaces using gin (lower(name) extensions.gin_trgm_ops);

create table public.space_members (
  space_id uuid not null references public.spaces (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role public.space_role not null default 'member',
  joined_at timestamptz not null default now(),
  primary key (space_id, user_id)
);

create index space_members_user_idx on public.space_members (user_id);

alter table public.spaces enable row level security;
alter table public.space_members enable row level security;

create function public.is_space_moderator(p_space_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_moderator() or exists (
    select 1 from public.space_members
    where space_id = p_space_id and user_id = auth.uid() and role in ('owner', 'moderator')
  )
$$;

create policy "Spaces are public" on public.spaces for select using (true);
revoke insert, update, delete on public.spaces from anon, authenticated;
grant update (name, description, emoji) on public.spaces to authenticated;
create policy "Space moderators edit spaces" on public.spaces for update to authenticated
  using (public.is_space_moderator(id)) with check (public.is_space_moderator(id));

create policy "Space members are public" on public.space_members for select using (true);
create policy "People join spaces" on public.space_members for insert to authenticated
  with check (user_id = auth.uid() and role = 'member' and public.is_active_member());
create policy "People leave spaces" on public.space_members for delete to authenticated
  using (user_id = auth.uid() and role <> 'owner');

create function public.update_space_member_count()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    update public.spaces set members_count = members_count + 1 where id = new.space_id;
    return new;
  end if;
  update public.spaces set members_count = greatest(members_count - 1, 0) where id = old.space_id;
  return old;
end;
$$;

create trigger space_members_count after insert or delete on public.space_members
  for each row execute function public.update_space_member_count();

create function public.create_space(
  p_slug text,
  p_name text,
  p_description text,
  p_kind public.space_kind,
  p_city_id smallint default null,
  p_emoji text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not public.is_active_member() then
    raise exception 'Sign in to start a space' using errcode = '42501';
  end if;
  if (select count(*) from public.spaces where created_by = auth.uid() and created_at > now() - interval '1 day') >= 3 then
    raise exception 'You can start up to 3 spaces a day' using errcode = '23514';
  end if;

  insert into public.spaces (slug, name, description, kind, city_id, emoji, created_by)
  values (lower(trim(p_slug)), trim(p_name), coalesce(trim(p_description), ''), p_kind, p_city_id, nullif(trim(p_emoji), ''), auth.uid())
  returning id into v_id;

  insert into public.space_members (space_id, user_id, role) values (v_id, auth.uid(), 'owner');
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Events
-- ---------------------------------------------------------------------------

create table public.events (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references public.profiles (id) on delete cascade,
  created_by uuid references public.profiles (id) on delete set null,
  status public.content_status not null default 'pending',
  title text not null check (char_length(title) between 3 and 120),
  description text not null default '' check (char_length(description) <= 4000),
  category public.event_category not null default 'community',
  format public.event_format not null default 'in_person',
  starts_at timestamptz not null,
  ends_at timestamptz,
  timezone text not null default 'Australia/Sydney',
  city_id smallint references public.cities (id) on delete set null,
  venue_name text check (char_length(venue_name) <= 120),
  address text check (char_length(address) <= 200),
  online_url text check (online_url ~ '^https://'),
  ticket_url text check (ticket_url ~ '^https://'),
  cover_url text check (cover_url ~ '^https?://'),
  is_free boolean not null default true,
  capacity integer check (capacity between 1 and 100000),
  space_id uuid references public.spaces (id) on delete set null,
  going_count integer not null default 0,
  interested_count integer not null default 0,
  rejection_reason text check (char_length(rejection_reason) <= 280),
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  check (ends_at is null or ends_at > starts_at),
  check (format = 'online' or city_id is not null),
  check (format = 'in_person' or online_url is not null)
);

create index events_upcoming_idx on public.events (starts_at) where status = 'published' and cancelled_at is null;
create index events_city_idx on public.events (city_id, starts_at);
create index events_host_idx on public.events (host_id, starts_at desc);

create table public.event_rsvps (
  event_id uuid not null references public.events (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  status public.rsvp_status not null,
  created_at timestamptz not null default now(),
  primary key (event_id, user_id)
);

create index event_rsvps_user_idx on public.event_rsvps (user_id);

alter table public.events enable row level security;
alter table public.event_rsvps enable row level security;

create policy "Published events are public" on public.events for select
  using (status = 'published' or public.can_act_as(host_id) or public.is_moderator());

revoke update on public.events from authenticated;
grant update (
  title, description, category, format, starts_at, ends_at, timezone, city_id, venue_name,
  address, online_url, ticket_url, cover_url, is_free, capacity, space_id, cancelled_at
) on public.events to authenticated;

create policy "Hosts create events" on public.events for insert to authenticated
  with check (public.can_act_as(host_id) and created_by = auth.uid() and public.is_active_member());
create policy "Hosts edit events" on public.events for update to authenticated
  using (public.can_act_as(host_id)) with check (public.can_act_as(host_id));
create policy "Hosts delete events" on public.events for delete to authenticated
  using (public.can_act_as(host_id));

-- Attendee lists of published events are public; RSVPs to anything else are
-- visible to the person and the host only.
create policy "RSVPs are visible with their event" on public.event_rsvps for select
  using (
    user_id = auth.uid()
    or exists (select 1 from public.events e where e.id = event_id and (e.status = 'published' or public.can_act_as(e.host_id)))
  );
create policy "People RSVP as themselves" on public.event_rsvps for insert to authenticated
  with check (user_id = auth.uid() and public.is_active_member());
create policy "People change their RSVP" on public.event_rsvps for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "People withdraw their RSVP" on public.event_rsvps for delete to authenticated
  using (user_id = auth.uid());

create function public.check_event_rsvp()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event public.events;
begin
  select * into v_event from public.events where id = new.event_id;
  if v_event.status <> 'published' then
    raise exception 'This event is not open for RSVPs' using errcode = '23514';
  end if;
  if v_event.cancelled_at is not null then
    raise exception 'This event was cancelled' using errcode = '23514';
  end if;
  if coalesce(v_event.ends_at, v_event.starts_at + interval '6 hours') < now() then
    raise exception 'This event has ended' using errcode = '23514';
  end if;
  if public.is_blocked_between(new.user_id, v_event.host_id) then
    raise exception 'You cannot RSVP to this event' using errcode = '42501';
  end if;
  if new.status = 'going' and v_event.capacity is not null
     and (tg_op = 'INSERT' or old.status <> 'going')
     and v_event.going_count >= v_event.capacity then
    raise exception 'This event is full' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger event_rsvps_check before insert or update on public.event_rsvps
  for each row execute function public.check_event_rsvp();

create function public.update_event_rsvp_counts()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then
    update public.events set
      going_count = greatest(going_count - (old.status = 'going')::int, 0),
      interested_count = greatest(interested_count - (old.status = 'interested')::int, 0)
    where id = old.event_id;
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    update public.events set
      going_count = going_count + (new.status = 'going')::int,
      interested_count = interested_count + (new.status = 'interested')::int
    where id = new.event_id;
  end if;
  return coalesce(new, old);
end;
$$;

create trigger event_rsvps_counts after insert or update or delete on public.event_rsvps
  for each row execute function public.update_event_rsvp_counts();

-- ---------------------------------------------------------------------------
-- Opportunities: jobs, scholarships, grants, mentoring and business
-- ---------------------------------------------------------------------------

create table public.opportunities (
  id uuid primary key default gen_random_uuid(),
  poster_id uuid not null references public.profiles (id) on delete cascade,
  created_by uuid references public.profiles (id) on delete set null,
  status public.content_status not null default 'pending',
  type public.opportunity_type not null,
  title text not null check (char_length(title) between 3 and 120),
  organisation_name text check (char_length(organisation_name) <= 120),
  description text not null check (char_length(description) between 10 and 6000),
  city_id smallint references public.cities (id) on delete set null,
  is_remote boolean not null default false,
  location_text text check (char_length(location_text) <= 120),
  apply_url text check (apply_url ~ '^https://'),
  apply_email text check (apply_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  deadline_at timestamptz,
  compensation text check (char_length(compensation) <= 120),
  tags text[] not null default '{}' check (cardinality(tags) <= 8),
  rejection_reason text check (char_length(rejection_reason) <= 280),
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  check (apply_url is not null or apply_email is not null)
);

create index opportunities_open_idx on public.opportunities (created_at desc) where status = 'published' and closed_at is null;
create index opportunities_city_idx on public.opportunities (city_id, created_at desc);
create index opportunities_poster_idx on public.opportunities (poster_id, created_at desc);
create index opportunities_title_trgm_idx on public.opportunities using gin (lower(title) extensions.gin_trgm_ops);

alter table public.opportunities enable row level security;

create policy "Published opportunities are public" on public.opportunities for select
  using (status = 'published' or public.can_act_as(poster_id) or public.is_moderator());

revoke update on public.opportunities from authenticated;
grant update (
  type, title, organisation_name, description, city_id, is_remote, location_text,
  apply_url, apply_email, deadline_at, compensation, tags, closed_at
) on public.opportunities to authenticated;

create policy "Posters create opportunities" on public.opportunities for insert to authenticated
  with check (public.can_act_as(poster_id) and created_by = auth.uid() and public.is_active_member());
create policy "Posters edit opportunities" on public.opportunities for update to authenticated
  using (public.can_act_as(poster_id)) with check (public.can_act_as(poster_id));
create policy "Posters delete opportunities" on public.opportunities for delete to authenticated
  using (public.can_act_as(poster_id));

create table public.saved_opportunities (
  user_id uuid not null references public.profiles (id) on delete cascade,
  opportunity_id uuid not null references public.opportunities (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, opportunity_id)
);

alter table public.saved_opportunities enable row level security;
create policy "Saved opportunities are private" on public.saved_opportunities for select to authenticated
  using (user_id = auth.uid());
create policy "People save opportunities" on public.saved_opportunities for insert to authenticated
  with check (user_id = auth.uid());
create policy "People unsave opportunities" on public.saved_opportunities for delete to authenticated
  using (user_id = auth.uid());
