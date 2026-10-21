-- Four findings from the October 2026 security audit.
--
-- 1. Operator authority followed site_role alone, so a suspended, banned or
--    under-16 moderator kept every moderation power and a banned admin could
--    lift their own ban. Operators are members first: is_moderator() and
--    is_admin() now require is_active_member(), and nobody changes their own
--    sanctions.
-- 2. Listings were reviewed only when inserted. An approved event or
--    opportunity could be rewritten, links included, with no new automatic
--    check and no moderator. An edit to the checked text now goes through the
--    same decision as creating it.
-- 3. Group management, request acceptance, reactions and channel broadcasts
--    skipped is_active_member(), unlike sending a message. They no longer do.
-- 4. URL columns members write directly were checked for a scheme prefix only,
--    and a value a browser cannot parse broke the review queue and event pages.
--    They now have to be addresses a browser can parse.

-- 1. Sanctioned operators lose their authority at once.
create or replace function public.is_moderator()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_active_member() and exists (
    select 1 from public.profile_settings
    where id = auth.uid() and site_role in ('moderator', 'admin')
  )
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_active_member() and exists (
    select 1 from public.profile_settings where id = auth.uid() and site_role = 'admin'
  )
$$;

create or replace function public.require_sanction_rights(p_profile_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_moderator();
  if p_profile_id = auth.uid() then
    raise exception 'You cannot change your own sanctions' using errcode = '42501';
  end if;
  if not exists (select 1 from public.profiles where id = p_profile_id and account_type = 'person') then
    raise exception 'That account is not a person' using errcode = '23514';
  end if;
  if exists (select 1 from public.profile_settings where id = p_profile_id and site_role <> 'member') and not public.is_admin() then
    raise exception 'Only admins can suspend moderators' using errcode = '42501';
  end if;
end;
$$;

-- 2. An edit to a listing's words or links is reviewed like a new listing.
create function public.review_listing_edit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status = 'published' and auth.uid() is not null then
    if not public.has_good_reputation(auth.uid()) then
      new.status := 'pending';
      new.rejection_reason := null;
    end if;
    -- A flag from an earlier check would stop the automatic check reading the new text.
    if tg_table_name = 'events' then
      delete from public.listing_flags where event_id = new.id;
    else
      delete from public.listing_flags where opportunity_id = new.id;
    end if;
  end if;
  return new;
end;
$$;

create function public.recheck_listing()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_type public.report_target := case tg_table_name when 'events' then 'event' else 'opportunity' end::public.report_target;
begin
  if new.status <> 'rejected' and public.needs_automatic_check(new.created_by, old.created_at) then
    insert into public.background_tasks (kind, target_type, target_id) values ('automatic_check', v_type, new.id)
    on conflict (kind, target_type, target_id) do update set attempts = 0, run_after = now(), failed_at = null, last_error = null;
  end if;
  return null;
end;
$$;

revoke all on function public.review_listing_edit() from public, anon, authenticated;
revoke all on function public.recheck_listing() from public, anon, authenticated;

create trigger events_review_edit before update of title, description, venue_name, address, online_url, ticket_url, cover_url on public.events
  for each row
  when (row(old.title, old.description, old.venue_name, old.address, old.online_url, old.ticket_url, old.cover_url)
        is distinct from row(new.title, new.description, new.venue_name, new.address, new.online_url, new.ticket_url, new.cover_url))
  execute function public.review_listing_edit();
create trigger events_recheck after update of title, description, venue_name, address, online_url, ticket_url, cover_url on public.events
  for each row
  when (row(old.title, old.description, old.venue_name, old.address, old.online_url, old.ticket_url, old.cover_url)
        is distinct from row(new.title, new.description, new.venue_name, new.address, new.online_url, new.ticket_url, new.cover_url))
  execute function public.recheck_listing();
create trigger opportunities_review_edit before update of title, organisation_name, description, location_text, apply_url, apply_email, compensation on public.opportunities
  for each row
  when (row(old.title, old.organisation_name, old.description, old.location_text, old.apply_url, old.apply_email, old.compensation)
        is distinct from row(new.title, new.organisation_name, new.description, new.location_text, new.apply_url, new.apply_email, new.compensation))
  execute function public.review_listing_edit();
create trigger opportunities_recheck after update of title, organisation_name, description, location_text, apply_url, apply_email, compensation on public.opportunities
  for each row
  when (row(old.title, old.organisation_name, old.description, old.location_text, old.apply_url, old.apply_email, old.compensation)
        is distinct from row(new.title, new.organisation_name, new.description, new.location_text, new.apply_url, new.apply_email, new.compensation))
  execute function public.recheck_listing();

-- 3. Suspended, banned and deactivated members cannot act in messaging.
create or replace function public.add_group_members(p_conversation_id uuid, p_member_ids uuid[], p_share_history boolean default false)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_member uuid;
  v_from timestamptz := case when p_share_history then '-infinity'::timestamptz else now() end;
begin
  if not public.is_active_member() then
    raise exception 'Your account can''t do this right now' using errcode = '42501';
  end if;
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

create or replace function public.rename_group(p_conversation_id uuid, p_title text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_active_member() then
    raise exception 'Your account can''t do this right now' using errcode = '42501';
  end if;
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

create or replace function public.set_group_role(p_conversation_id uuid, p_user_id uuid, p_role public.participant_role)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_active_member() then
    raise exception 'Your account can''t do this right now' using errcode = '42501';
  end if;
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

-- Leaving stays open to everyone; removing someone else takes an active admin.
create or replace function public.remove_group_member(p_conversation_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_user_id <> auth.uid() and (not public.is_active_member() or not exists (
    select 1 from public.conversation_participants
    where conversation_id = p_conversation_id and user_id = auth.uid() and role in ('owner', 'admin')
  )) then
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

-- Declining stays open; accepting takes an active member.
create or replace function public.respond_to_message_request(p_conversation_id uuid, p_accept boolean)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.conversation_participants
  set status = case when p_accept then 'accepted' else 'declined' end::public.participant_status,
      last_read_at = case when p_accept then last_read_at else now() end
  where conversation_id = p_conversation_id and user_id = auth.uid() and status = 'pending'
    and (not p_accept or public.is_active_member())
$$;

alter policy "Participants react" on public.message_reactions
  with check (
    user_id = (select auth.uid())
    and public.is_active_member()
    and exists (
      select 1 from public.messages m
      where m.id = message_reactions.message_id and m.removed_at is null and public.is_accepted_participant(m.conversation_id)
    )
  );

create or replace function public.realtime_topic_allowed(p_topic text, p_extension text, p_send boolean)
returns boolean
language sql
stable
set search_path = ''
as $$
  select case
    when p_topic like 'conversation:%' then
      p_extension = 'broadcast'
      and case
        when p_send then public.is_active_member() and public.is_accepted_participant(public.try_uuid(substr(p_topic, 14)))
        else public.is_participant(public.try_uuid(substr(p_topic, 14)))
      end
    when p_topic in ('inbox:' || auth.uid(), 'counts:' || auth.uid()) then not p_send
    else false
  end
$$;

-- 4. Web addresses members store directly must be ones a browser can parse:
-- a scheme, a host without spaces, percent signs, userinfo or brackets (or an
-- IPv6 literal), an optional port up to 65535, then no whitespace.
create function public.is_web_url(p_url text, p_https_only boolean default false)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_url ~ ('^http' || case when p_https_only then 's' else 's?' end
    || '://([^[:space:]/:?#@%\[\]]+|\[[0-9A-Fa-f:.]+\])'
    || '(:([0-9]{1,4}|[1-5][0-9]{4}|6[0-4][0-9]{3}|65[0-4][0-9]{2}|655[0-2][0-9]|6553[0-5]))?'
    || '([/?#][^[:space:]]*)?$')
$$;
grant execute on function public.is_web_url(text, boolean) to anon, authenticated, service_role;

-- Rows written before this migration are left as they are; the renderer no longer trips on them.
alter table public.events add constraint events_online_url_web check (online_url is null or public.is_web_url(online_url, true)) not valid;
alter table public.events add constraint events_ticket_url_web check (ticket_url is null or public.is_web_url(ticket_url, true)) not valid;
alter table public.opportunities add constraint opportunities_apply_url_web check (apply_url is null or public.is_web_url(apply_url, true)) not valid;
alter table public.profiles add constraint profiles_website_web check (website is null or public.is_web_url(website)) not valid;
