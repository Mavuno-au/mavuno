-- Ten low findings from the October 2026 security audit.
--
-- 1. Post images could point at any host with the Storage path shape; they now
--    have to live on this project's Storage, like avatars and covers.
-- 2. One post could mention any number of members; ten is the cap.
-- 3. Deleting a listing refunded the 10-a-day allowance; listings now count in
--    the rate_limits ledger, where undoing gives nothing back.
-- 4. A message could carry another participant's photo path and have it erased
--    with the copier's message or account; paths belong to one message and are
--    only queued for erasure once nothing shows them.
-- 5. Quote cards and notifications applied a block to the organisation a post
--    appeared under, not the person who wrote it.
-- 6. Restoring an appealed suspension lifted whatever sanction was current,
--    including a later ban; a restore is bound to the decision it names.
-- 7. A suspended member could change their email, delete the account and
--    re-register with the original address; the email of a sanctioned account
--    cannot change.
-- 8. An under-16 deactivation ended with the account; its sign-in identity is
--    now remembered for a year, like a ban, so the review by email stays the
--    way back.
-- 9. The age-deactivation purge matched the member's folder as text and missed
--    uploads stored under another spelling of the id.
-- 10. Anyone running an organisation could put any person on its team, even
--     across a block; being added is now an invitation the person accepts.

-- 1 and 2. Post images from own Storage only, and at most ten mentions.
create or replace function public.create_post(
  p_body text,
  p_language text default 'en',
  p_author_id uuid default null,
  p_parent_id uuid default null,
  p_quote_id uuid default null,
  p_space_id uuid default null,
  p_link_url text default null,
  p_images jsonb default '[]'::jsonb,
  p_poll jsonb default null,
  p_event_id uuid default null,
  p_opportunity_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_author uuid := coalesce(p_author_id, auth.uid());
  v_body text := trim(coalesce(p_body, ''));
  v_images jsonb := coalesce(p_images, '[]'::jsonb);
  v_link text := nullif(trim(p_link_url), '');
  v_parent public.posts;
  v_quoted public.posts;
  v_id uuid;
  v_image jsonb;
  v_position integer := 0;
  v_options text[];
  v_mentioned uuid[];
  v_repeated boolean;
begin
  if not public.is_active_member() then
    raise exception 'Your account cannot post right now' using errcode = '42501';
  end if;
  if not public.can_act_as(v_author) then
    raise exception 'You cannot post as this profile' using errcode = '42501';
  end if;
  if (select count(*) from public.posts where created_by = auth.uid() and created_at > now() - interval '1 minute') >= 10 then
    raise exception 'Slow down a little: you can post 10 times a minute' using errcode = '23514';
  end if;

  if char_length(v_body) > 4000 then
    raise exception 'Posts can be up to 4,000 characters' using errcode = '23514';
  end if;
  if jsonb_typeof(v_images) <> 'array' or jsonb_array_length(v_images) > 4 then
    raise exception 'Add up to 4 images' using errcode = '23514';
  end if;
  if char_length(v_body) < 1 and jsonb_array_length(v_images) = 0 and p_event_id is null and p_opportunity_id is null then
    raise exception 'Write something first' using errcode = '23514';
  end if;
  if p_poll is not null and (jsonb_array_length(v_images) > 0 or p_parent_id is not null) then
    raise exception 'Polls go on their own post, without images, and not in replies' using errcode = '23514';
  end if;
  -- A link card shows a link that is in the post, never one the reader can't
  -- see. The app links "www." addresses as https.
  if v_link is not null and strpos(v_body, v_link) = 0
     and not (v_link ~* '^https://www\.' and strpos(v_body, substr(v_link, 9)) > 0) then
    raise exception 'Only a link in the post can become its card' using errcode = '23514';
  end if;

  if p_parent_id is not null then
    select * into v_parent from public.posts where id = p_parent_id;
    if v_parent.id is null or not public.can_see_post(p_parent_id) then
      raise exception 'That post is no longer available' using errcode = 'P0002';
    end if;
    if public.is_blocked_between(v_author, v_parent.author_id) or public.is_blocked_between(v_author, v_parent.created_by) then
      raise exception 'You cannot reply to this post' using errcode = '42501';
    end if;
  end if;

  if p_quote_id is not null then
    select * into v_quoted from public.posts where id = p_quote_id;
    if v_quoted.id is null or v_quoted.status <> 'published' or not public.can_see_post(p_quote_id) then
      raise exception 'That post is no longer available' using errcode = 'P0002';
    end if;
    if public.is_blocked_between(v_author, v_quoted.author_id) or public.is_blocked_between(v_author, v_quoted.created_by) then
      raise exception 'You cannot quote this post' using errcode = '42501';
    end if;
  end if;

  if p_space_id is not null and p_parent_id is null and not exists (
    select 1 from public.space_members where space_id = p_space_id and user_id = auth.uid()
  ) then
    raise exception 'Join the space to post in it' using errcode = '42501';
  end if;
  if p_event_id is not null and not exists (
    select 1 from public.events where id = p_event_id and public.can_act_as(host_id)
  ) then
    raise exception 'You can only share events you host' using errcode = '42501';
  end if;
  if p_opportunity_id is not null and not exists (
    select 1 from public.opportunities where id = p_opportunity_id and public.can_act_as(poster_id)
  ) then
    raise exception 'You can only share opportunities you posted' using errcode = '42501';
  end if;

  -- Twice is fine (a correction, a cross-post); a third copy within the hour
  -- waits for a moderator. Short replies such as "Congratulations!" repeat
  -- naturally, so only posts of 20 characters or more count.
  v_repeated := char_length(v_body) >= 20 and (
    select count(*) from public.posts
    where created_by = auth.uid() and created_at > now() - interval '1 hour'
      and lower(regexp_replace(body, '\s+', ' ', 'g')) = lower(regexp_replace(v_body, '\s+', ' ', 'g'))
  ) >= 2;

  select coalesce(array_agg(pr.id), '{}') into v_mentioned
  from public.profiles pr
  where pr.username = any (public.extract_mentions(v_body))
    and not public.is_blocked_between(pr.id, v_author)
    and not public.is_blocked_between(pr.id, auth.uid());
  -- Every mention notifies someone; one post cannot notify half the network.
  if coalesce(cardinality(v_mentioned), 0) > 10 then
    raise exception 'Mention up to 10 people in a post' using errcode = '23514';
  end if;

  insert into public.posts (
    author_id, created_by, body, language, parent_id, root_id, quote_id, space_id,
    event_id, opportunity_id, link_url, topics, mentions, moderation_note
  ) values (
    v_author, auth.uid(), v_body, coalesce(nullif(lower(p_language), ''), 'en'),
    p_parent_id, coalesce(v_parent.root_id, v_parent.id), p_quote_id,
    coalesce(v_parent.space_id, p_space_id), p_event_id, p_opportunity_id,
    v_link, public.extract_topics(v_body), v_mentioned,
    case when v_repeated then 'Held for review: posted several times in an hour' end
  )
  returning id into v_id;

  for v_image in select * from jsonb_array_elements(v_images) loop
    -- An image is the public address, on this project's Storage, of a WebP the
    -- server wrote into the uploader's own posts folder, as avatars and covers
    -- already are (is_stored_image); any other host would see who looked.
    if coalesce(v_image ->> 'path', '') !~ ('^' || auth.uid()::text || '/posts/[A-Za-z0-9_-]+\.webp$')
       or not public.is_stored_image(v_image ->> 'url', auth.uid(), 'posts')
       or (v_image ->> 'path') is distinct from substring(v_image ->> 'url' from '/storage/v1/object/public/media/(.*)$') then
      raise exception 'Invalid image' using errcode = '42501';
    end if;
    insert into public.post_images (post_id, storage_path, url, width, height, alt_text, position)
    values (
      v_id, v_image ->> 'path', v_image ->> 'url',
      nullif(v_image ->> 'width', '')::integer, nullif(v_image ->> 'height', '')::integer,
      left(trim(coalesce(v_image ->> 'alt', '')), 1000), v_position
    );
    v_position := v_position + 1;
  end loop;

  if p_poll is not null then
    select array_agg(distinct trim(o)) into v_options
    from jsonb_array_elements_text(p_poll -> 'options') as o where trim(o) <> '';
    if coalesce(array_length(v_options, 1), 0) not between 2 and 4
       or jsonb_array_length(p_poll -> 'options') <> array_length(v_options, 1) then
      raise exception 'Polls need 2 to 4 different options' using errcode = '23514';
    end if;
    insert into public.polls (post_id, duration_hours)
    values (v_id, coalesce((p_poll ->> 'duration_hours')::integer, 24));
    insert into public.poll_options (post_id, position, label)
    select v_id, o.ordinality - 1, trim(o.value)
    from jsonb_array_elements_text(p_poll -> 'options') with ordinality as o;
  end if;

  if not v_repeated and public.has_good_reputation(auth.uid()) then
    perform public.publish_post(v_id);
  end if;

  return v_id;
end;
$$;

-- 3. Listings count in the ledger, so deleting one gives nothing back.
create or replace function public.prepare_listing()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.count_towards_limit(new.created_by, 'listing', 10, interval '1 day', 'You have reached today''s limit for new listings');

  new.status := case when public.has_good_reputation(new.created_by) then 'published' else 'pending' end::public.content_status;
  new.rejection_reason := null;
  new.created_at := now();
  if tg_table_name = 'events' then
    new.going_count := 0;
    new.interested_count := 0;
  end if;
  return new;
end;
$$;

-- 4. A photo path belongs to one message, and is erased only once nothing shows it.
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
    -- A photo someone else sent is theirs to keep or remove.
    if exists (
      select 1 from public.messages m
      where m.conversation_id = new.conversation_id and m.id is distinct from new.id and v_path = any (m.image_paths)
    ) then
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

create or replace function public.queue_message_media()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.storage_cleanup (bucket, path)
  select 'message-media', path from unnest(old.image_paths) as path
  where (tg_op = 'DELETE' or not (path = any (new.image_paths)))
    and not exists (select 1 from public.messages m where m.id <> old.id and path = any (m.image_paths))
  on conflict do nothing;
  return null;
end;
$$;

-- 5. A block follows the writer into quote cards and notifications.
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
  and not exists (select 1 from public.posts p where p.id = n.post_id and public.is_blocked_with_viewer(p.created_by))
  and not exists (select 1 from public.posts p where p.id = n.post_id and p.deleted_at is not null)
  and (
    n.post_id is null
    or n.type = 'like'
    or (n.type = 'moderation' and n.rule is not null)
    or exists (select 1 from public.posts p where p.id = n.post_id and p.status = 'published')
  )
  and (n.type <> 'follow' or exists (select 1 from public.follows f where f.follower_id = n.actor_id and f.followee_id = n.recipient_id));

-- 6. A restore ends the sanction the decision imposed, not whatever is current.
create or replace function public.moderate_restore(p_action_id bigint, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reason text := nullif(left(trim(p_reason), 280), '');
  v_decision public.moderation_actions;
  v_label text;
  v_profile uuid;
  v_action bigint;
  v_banned timestamptz;
begin
  perform public.require_moderator();
  select * into v_decision from public.moderation_actions where id = p_action_id;
  if v_decision.id is null then
    raise exception 'There is no decision %', p_action_id using errcode = 'P0002';
  end if;

  case v_decision.action
    when 'reject' then
      case v_decision.target_type
        when 'post' then
          select author_id into v_profile from public.posts where id = v_decision.target_id and status = 'rejected' and deleted_at is null;
          if v_profile is null then
            raise exception 'That post is no longer there to restore' using errcode = 'P0002';
          end if;
          perform public.publish_post(v_decision.target_id);
          v_label := 'post';
        when 'event' then
          update public.events set status = 'published', rejection_reason = null
          where id = v_decision.target_id and status = 'rejected' returning host_id into v_profile;
          v_label := 'event';
        when 'opportunity' then
          update public.opportunities set status = 'published', rejection_reason = null
          where id = v_decision.target_id and status = 'rejected' returning poster_id into v_profile;
          v_label := 'opportunity';
        else
          raise exception 'Removed messages and spaces cannot be restored' using errcode = '23514';
      end case;
      if v_profile is null then
        raise exception 'That % is no longer there to restore', v_decision.target_type using errcode = 'P0002';
      end if;
      v_action := public.record_moderation('restore', v_decision.target_type, v_decision.target_id, v_reason, null);
      perform public.notify_moderation(v_profile, case when v_decision.target_type = 'post' then v_decision.target_id end,
        'After another look, your ' || v_label || ' is back.' || coalesce(' ' || v_reason, ''), null, v_action);
    when 'suspend' then
      select banned_at into v_banned from public.profile_settings where id = v_decision.target_id;
      if v_banned is not null then
        raise exception 'That suspension was followed by a ban; restore the ban decision instead' using errcode = '23514';
      end if;
      if exists (
        select 1 from public.moderation_actions a
        where a.profile_id = v_decision.target_id and a.action = 'suspend' and a.id > v_decision.id
      ) then
        raise exception 'A later suspension is in force; restore that decision instead' using errcode = '23514';
      end if;
      perform public.moderate_lift_suspension(v_decision.target_id, v_reason);
    when 'ban' then
      select banned_at into v_banned from public.profile_settings where id = v_decision.target_id;
      if v_banned is null then
        raise exception 'That account is not banned' using errcode = '23514';
      end if;
      perform public.moderate_lift_suspension(v_decision.target_id, v_reason);
    else
      raise exception 'Decision % did not remove or suspend anything', p_action_id using errcode = '23514';
  end case;
end;
$$;

-- 7. A sanctioned account keeps the sign-in identity the sanction was applied to.
create function public.refuse_sanctioned_identity_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.email is distinct from old.email and exists (
    select 1 from public.profile_settings s
    where s.id = old.id and (s.banned_at is not null or s.suspended_until > now())
  ) then
    raise exception 'Your email can''t be changed while your account is suspended' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function public.refuse_sanctioned_identity_change() from public, anon, authenticated;
create trigger on_auth_user_email_change before update of email on auth.users
  for each row execute function public.refuse_sanctioned_identity_change();

-- 8 and 9. An under-16 determination outlives the account for a year, and the
-- purge finds the member's uploads whatever the spelling of the folder.
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_until timestamptz;
  v_banned timestamptz;
  v_age timestamptz;
  v_rule public.community_rule;
begin
  if auth.uid() is null then
    raise exception 'Sign in first' using errcode = '42501';
  end if;
  select suspended_until, banned_at, age_deactivated_at into v_until, v_banned, v_age from public.profile_settings where id = auth.uid();
  if v_banned is not null or (v_until is not null and v_until > now()) then
    select rule into v_rule from public.moderation_actions
    where profile_id = auth.uid() and action in ('suspend', 'ban') and rule is not null
    order by created_at desc limit 1;
    perform public.remember_banned_identities(auth.uid(), coalesce(v_rule, 'terms'), case when v_banned is null then v_until end, null);
  elsif v_age is not null then
    -- A review by email is the way back; deleting the account is not.
    perform public.remember_banned_identities(auth.uid(), 'age', v_age + interval '1 year', null);
  end if;
  delete from auth.users where id = auth.uid();
end;
$$;

create or replace function public.purge_deactivated_accounts()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_age timestamptz;
  v_count integer := 0;
begin
  for v_id, v_age in
    select id, age_deactivated_at from public.profile_settings where age_deactivated_at < now() - interval '30 days'
  loop
    insert into public.storage_cleanup (bucket, path)
    select o.bucket_id, o.name from storage.objects o
    where o.bucket_id = 'media' and public.try_uuid((storage.foldername(o.name))[1]) = v_id
    on conflict do nothing;
    insert into public.age_checks (profile_id, step) values (v_id, 'deleted');
    perform public.remember_banned_identities(v_id, 'age', v_age + interval '1 year', null);
    delete from auth.users where id = v_id;
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

create or replace function public.before_user_created(event jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.is_identity_banned(event -> 'user' ->> 'email', event -> 'user' -> 'identities') then
    return jsonb_build_object('error', jsonb_build_object(
      'http_code', 403,
      'message', 'An account using this email address or sign-in was banned from Mavuno, or is waiting on an age review, so a new one can''t be created. If you think that''s a mistake, email us at the address on mavuno.au/terms.'
    ));
  end if;
  return '{}'::jsonb;
end;
$$;

-- 10. Joining an organisation's team is an invitation the person accepts.
alter table public.organisation_members add column accepted_at timestamptz;
-- Everyone on a team before invitations existed had agreed to be there.
update public.organisation_members set accepted_at = created_at;

create or replace function public.check_organisation_member()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.profiles where id = new.org_id and account_type = 'organisation') then
    raise exception 'Not an organisation' using errcode = '23514';
  end if;
  if not exists (select 1 from public.profiles where id = new.user_id and account_type = 'person') then
    raise exception 'Only people can run organisations' using errcode = '23514';
  end if;
  if tg_op = 'INSERT' then
    -- Your own row (creating the organisation) is accepted; anyone else's is
    -- an invitation until they accept it, and cannot be sent across a block.
    if auth.uid() is not null and new.user_id <> auth.uid() then
      if public.is_blocked_between(auth.uid(), new.user_id) then
        raise exception 'You cannot add this person' using errcode = '42501';
      end if;
      new.accepted_at := null;
    else
      new.accepted_at := coalesce(new.accepted_at, now());
    end if;
  end if;
  return new;
end;
$$;

create function public.accept_team_invitation(p_org_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.organisation_members set accepted_at = now()
  where org_id = p_org_id and user_id = auth.uid() and accepted_at is null and public.is_active_member()
$$;
revoke all on function public.accept_team_invitation(uuid) from public, anon;
grant execute on function public.accept_team_invitation(uuid) to authenticated;

create or replace function public.can_act_as(p_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_profile_id is not null and auth.uid() is not null and (
    p_profile_id = auth.uid()
    or exists (select 1 from public.organisation_members where org_id = p_profile_id and user_id = auth.uid() and accepted_at is not null)
  )
$$;

create or replace function public.can_manage_org(p_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.organisation_members
    where org_id = p_org_id and user_id = auth.uid() and role in ('owner', 'admin') and accepted_at is not null
  )
$$;

create or replace function public.has_good_reputation(p_person uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.profile_settings where id = p_person and site_role in ('moderator', 'admin')) then
    return true;
  end if;

  if exists (
    select 1 from public.reports r
    where r.status <> 'dismissed' and r.created_at > now() - interval '7 days'
      and (r.reporter_standing or r.status = 'actioned')
      and (r.target_profile_id = p_person or r.target_profile_id in (
        select org_id from public.organisation_members where user_id = p_person and accepted_at is not null
      ))
  ) then
    return false;
  end if;

  if not (select premoderation from public.site_settings) then
    return true;
  end if;

  return exists (select 1 from public.profiles where id = p_person and created_at < now() - interval '1 hour')
    and (
      exists (select 1 from public.posts where created_by = p_person and published_at is not null)
      or exists (select 1 from public.events where created_by = p_person and status = 'published')
      or exists (select 1 from public.opportunities where created_by = p_person and status = 'published')
    );
end;
$$;
