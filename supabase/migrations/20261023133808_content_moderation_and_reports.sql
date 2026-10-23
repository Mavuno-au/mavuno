-- Content and moderation gaps found in a full review on 23 October 2026.
--
-- 1. A link typed with a capital letter ("Https://", as phones write at the
--    start of a sentence) failed the post or message with "Something went
--    wrong": the link checks were case-sensitive, finding links wasn't.
-- 2. A moderator acting on a post its author had already deleted counted it
--    out a second time and told the author it was removed. Acting twice on
--    the same post notified and logged twice.
-- 3. Deleting an account left its replies and quotes counted on everyone
--    else's posts, and thread scores counting them.
-- 4. Reinstating an age review published a banned member's posts again.
-- 5. A quote showed a muted person's post in full; it now says it's muted.
-- 6. Suspended owners could still change team roles and pin posts, and an
--    owner could make someone who never accepted an owner.
-- 7. Reports kept the reporter's own words and contact details after their
--    account was deleted, and the export left them out (and poll options).

-- ---------------------------------------------------------------------------
-- 1. Links in any case
-- ---------------------------------------------------------------------------

alter table public.posts drop constraint posts_link_url_check,
  add constraint posts_link_url_check check (link_url ~* '^https?://' and char_length(link_url) <= 2000);
alter table public.messages drop constraint messages_link_url_check,
  add constraint messages_link_url_check check (link_url ~* '^https?://' and char_length(link_url) <= 2000);
alter table public.scheduled_posts drop constraint scheduled_posts_link_url_check,
  add constraint scheduled_posts_link_url_check check (link_url ~* '^https?://' and char_length(link_url) <= 2000);

-- ---------------------------------------------------------------------------
-- 2. Moderating what is already gone, or already decided
-- ---------------------------------------------------------------------------

create or replace function public.moderate_content(p_target_type public.report_target, p_target_id uuid, p_approve boolean, p_reason text default null, p_rule public.community_rule default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile uuid;
  v_post public.posts;
  v_reason text := nullif(left(trim(p_reason), 280), '');
  v_label text;
  v_action bigint;
begin
  perform public.require_moderator();
  if not p_approve and (p_rule is null or p_rule = 'age') then
    raise exception 'Choose the rule it breaks' using errcode = '23514';
  end if;

  case p_target_type
    when 'post' then
      select * into v_post from public.posts where id = p_target_id for update;
      -- Deleted by its author, or removed by another moderator a moment ago:
      -- the reports close, and nothing is counted, logged or said again.
      if v_post.deleted_at is not null or (not p_approve and v_post.status = 'rejected') then
        perform public.close_reports(p_target_type, p_target_id, case when p_approve then 'dismissed' else 'actioned' end::public.report_status);
        return;
      end if;
      v_profile := v_post.author_id;
      v_label := case when v_post.parent_id is null then 'post' else 'reply' end;
      if p_approve then
        perform public.publish_post(p_target_id);
      else
        update public.posts set status = 'rejected', moderation_note = v_reason where id = p_target_id;
        if v_post.status = 'published' then
          perform public.count_post(v_post, -1);
        end if;
      end if;
    when 'event' then
      update public.events
      set status = case when p_approve then 'published' else 'rejected' end::public.content_status,
          rejection_reason = case when p_approve then null else v_reason end
      where id = p_target_id returning host_id into v_profile;
      v_label := 'event';
    when 'opportunity' then
      update public.opportunities
      set status = case when p_approve then 'published' else 'rejected' end::public.content_status,
          rejection_reason = case when p_approve then null else v_reason end
      where id = p_target_id returning poster_id into v_profile;
      v_label := 'opportunity';
    when 'message' then
      if not p_approve then
        update public.messages set removed_at = now(), body = '', image_paths = '{}'
        where id = p_target_id returning sender_id into v_profile;
      end if;
      v_label := 'message';
    when 'space' then
      if not p_approve then
        delete from public.spaces where id = p_target_id and not is_official returning created_by into v_profile;
      end if;
      v_label := 'space';
    else
      raise exception 'Use moderate_suspend for profiles' using errcode = '22023';
  end case;

  perform public.close_reports(p_target_type, p_target_id, case when p_approve then 'dismissed' else 'actioned' end::public.report_status);
  v_action := public.record_moderation(case when p_approve then 'approve' else 'reject' end, p_target_type, p_target_id, v_reason, case when p_approve then null else p_rule end);

  if not p_approve then
    perform public.notify_moderation(
      v_profile, case when p_target_type = 'post' then p_target_id end,
      'Your ' || v_label || ' was removed ' || public.rule_phrase(p_rule) || '.' || coalesce(' Reason: ' || v_reason, ''),
      p_rule, v_action
    );
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. An erased post stops counting
-- ---------------------------------------------------------------------------

create or replace function public.erase_post(p_post_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_post public.posts;
begin
  select * into v_post from public.posts where id = p_post_id;

  insert into public.storage_cleanup (bucket, path)
  select 'media', storage_path from public.post_images where post_id = p_post_id
  on conflict do nothing;

  delete from public.deleted_post_contents where post_id = p_post_id;
  delete from public.post_images where post_id = p_post_id;
  delete from public.polls where post_id = p_post_id;
  delete from public.likes where post_id = p_post_id;
  delete from public.saves where post_id = p_post_id;
  delete from public.post_translations where post_id = p_post_id;
  delete from public.notifications where post_id = p_post_id;
  update public.posts set author_id = null, created_by = null, body = '', link_url = null, link_preview = null,
    topics = '{}', mentions = '{}', event_id = null, opportunity_id = null,
    deleted_at = coalesce(deleted_at, now())
  where id = p_post_id;

  -- A deleted post was counted out when it was deleted; one erased with its
  -- account is counted out of other people's posts and spaces here, once it
  -- no longer counts towards their scores. Not the author's own count: their
  -- profile is the row being deleted.
  if v_post.deleted_at is null and v_post.status = 'published' then
    if v_post.parent_id is not null then
      update public.posts set reply_count = greatest(reply_count - 1, 0) where id = v_post.parent_id;
    elsif v_post.space_id is not null then
      update public.spaces set posts_count = greatest(posts_count - 1, 0) where id = v_post.space_id;
    end if;
    if v_post.quote_id is not null then
      update public.posts set quote_count = greatest(quote_count - 1, 0) where id = v_post.quote_id;
      perform public.refresh_hot_score(v_post.quote_id);
    end if;
    if v_post.root_id is not null then
      perform public.refresh_hot_score(v_post.root_id);
    end if;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. A ban outlasts an age reinstatement
-- ---------------------------------------------------------------------------

create or replace function public.restore_hidden_content(p_profile_id uuid, p_note text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_post_id uuid;
begin
  -- Lifting a ban clears banned_at before restoring.
  if exists (select 1 from public.profile_settings where id = p_profile_id and banned_at is not null) then
    return;
  end if;
  for v_post_id in
    select id from public.posts
    where (author_id = p_profile_id or created_by = p_profile_id) and status = 'rejected' and moderation_note = p_note
  loop
    perform public.publish_post(v_post_id);
  end loop;
  update public.events set status = 'published', rejection_reason = null
  where (host_id = p_profile_id or created_by = p_profile_id) and rejection_reason = p_note;
  update public.opportunities set status = 'published', rejection_reason = null
  where (poster_id = p_profile_id or created_by = p_profile_id) and rejection_reason = p_note;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Quotes of muted people say so
-- ---------------------------------------------------------------------------

create or replace view public.post_details
with (security_invoker = true)
as
select
  p.id,
  p.author_id,
  p.created_by,
  p.status,
  p.body,
  p.language,
  p.parent_id,
  p.root_id,
  p.quote_id,
  p.space_id,
  p.link_url,
  p.link_preview,
  p.topics,
  p.moderation_note,
  p.reply_count,
  p.like_count,
  p.quote_count,
  p.hot_score,
  p.published_at,
  p.deleted_at,
  p.created_at,
  case when p.deleted_at is null then public.profile_card(p.author_id) end as author,
  public.is_muted_by_viewer(p.author_id) as author_muted,
  (
    select case when pp.deleted_at is null then pa.username end
    from public.posts pp left join public.profiles pa on pa.id = pp.author_id
    where pp.id = p.parent_id
  ) as parent_username,
  case when p.deleted_at is null then (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', i.id, 'url', i.url, 'width', i.width, 'height', i.height, 'alt', i.alt_text
    ) order by i.position), '[]'::jsonb)
    from public.post_images i where i.post_id = p.id
  ) else '[]'::jsonb end as images,
  case when p.deleted_at is null then public.post_poll(p.id) end as poll,
  case when p.quote_id is not null then coalesce((
    select case
      when q.deleted_at is not null then jsonb_build_object('id', q.id, 'deleted', true)
      when public.is_blocked_with_viewer(q.author_id) or public.is_blocked_with_viewer(q.created_by) then jsonb_build_object('id', q.id, 'unavailable', true)
      else jsonb_build_object(
        'id', q.id, 'body', q.body, 'created_at', q.created_at, 'language', q.language,
        'author', public.profile_card(q.author_id),
        'muted', public.is_muted_by_viewer(q.author_id) or public.is_muted_by_viewer(q.created_by),
        'image', (select jsonb_build_object('url', i.url, 'alt', i.alt_text) from public.post_images i where i.post_id = q.id order by i.position limit 1)
      )
    end
    from public.posts q where q.id = p.quote_id
  ), jsonb_build_object('id', p.quote_id, 'unavailable', true)) end as quoted,
  (
    select jsonb_build_object(
      'id', e.id, 'title', e.title, 'starts_at', e.starts_at, 'timezone', e.timezone, 'format', e.format,
      'venue_name', e.venue_name, 'city', (select c.name from public.cities c where c.id = e.city_id),
      'going_count', e.going_count, 'cancelled', e.cancelled_at is not null
    )
    from public.events e where e.id = p.event_id
  ) as event,
  (
    select jsonb_build_object(
      'id', o.id, 'title', o.title, 'type', o.type, 'organisation_name', o.organisation_name,
      'deadline_at', o.deadline_at, 'is_remote', o.is_remote,
      'city', (select c.name from public.cities c where c.id = o.city_id), 'closed', o.closed_at is not null
    )
    from public.opportunities o where o.id = p.opportunity_id
  ) as opportunity,
  (select jsonb_build_object('slug', s.slug, 'name', s.name, 'emoji', s.emoji) from public.spaces s where s.id = p.space_id) as space,
  exists (select 1 from public.likes l where l.post_id = p.id and l.user_id = auth.uid()) as liked,
  exists (select 1 from public.saves s where s.post_id = p.id and s.user_id = auth.uid()) as saved,
  (
    select t.body from public.post_translations t
    where t.post_id = p.id and t.created_at > now() - interval '7 days'
      and t.target_language = coalesce((select s.translation_language from public.profile_settings s where s.id = auth.uid()), '')
  ) as translation,
  case when p.deleted_at is null then (
    select count(*)::integer from public.continuation_ids(p.id, 101)
  ) else 0 end as continuation_count
from public.posts p
where not public.is_blocked_with_viewer(p.author_id)
  and not public.is_blocked_with_viewer(p.created_by);

-- ---------------------------------------------------------------------------
-- 6. Teams and pins for active members
-- ---------------------------------------------------------------------------

create or replace function public.set_organisation_role(p_org_id uuid, p_user_id uuid, p_role public.org_role)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_active_member() or not exists (
    select 1 from public.organisation_members where org_id = p_org_id and user_id = auth.uid() and role = 'owner' and accepted_at is not null
  ) then
    raise exception 'Only owners can change roles' using errcode = '42501';
  end if;
  if p_role = 'owner' and not exists (
    select 1 from public.organisation_members where org_id = p_org_id and user_id = p_user_id and accepted_at is not null
  ) then
    raise exception 'They need to accept the invitation first' using errcode = '23514';
  end if;
  update public.organisation_members set role = p_role where org_id = p_org_id and user_id = p_user_id;
end;
$$;

create or replace function public.pin_post(p_post_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_author uuid;
begin
  if not public.is_active_member() then
    raise exception 'You can''t pin posts right now' using errcode = '42501';
  end if;
  select author_id into v_author from public.posts
  where id = p_post_id and parent_id is null and deleted_at is null and status = 'published';
  if v_author is null or not public.can_act_as(v_author) then
    raise exception 'You can pin your own published posts' using errcode = '42501';
  end if;
  update public.profiles set pinned_post_id = p_post_id where id = v_author;
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. Reports in the export, and the reporter's words gone with the account
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
    -- Reports the person filed, in their own words, and polls they wrote with their options.
    'reports_filed', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'reason', r.reason, 'target_type', r.target_type, 'details', r.details, 'contact', r.contact,
        'status', r.status, 'created_at', r.created_at
      ) order by r.created_at), '[]')
      from public.reports r where r.reporter_id = auth.uid()
    ),
    'poll_options', (
      select coalesce(jsonb_agg(to_jsonb(o) order by o.post_id, o.position), '[]')
      from public.poll_options o join public.posts p on p.id = o.post_id where p.created_by = auth.uid()
    ),
    'push_devices', (select coalesce(jsonb_agg(jsonb_build_object('registered_at', t.created_at, 'last_opened_at', t.seen_at) order by t.created_at), '[]')
      from public.push_tokens t where t.profile_id = auth.uid())
  )
  where auth.uid() is not null
$$;

-- The reason and a snapshot of what was reported stay for the moderation
-- record; what the person wrote and how to reach them go.
create function public.forget_report_words()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.reports set details = null, contact = null where reporter_id = old.id and (details is not null or contact is not null);
  return old;
end;
$$;

revoke execute on function public.forget_report_words() from public, anon, authenticated;

create trigger profiles_forget_report_words before delete on public.profiles
  for each row execute function public.forget_report_words();

update public.reports set details = null, contact = null where reporter_id is null and (details is not null or contact is not null);
