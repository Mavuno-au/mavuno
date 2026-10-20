-- Photos are re-encoded on the server, so location data never depends on the
-- browser.
--
-- Members no longer write to Storage. They send a photo to /api/upload, which
-- asks can_upload whether they may, decodes it and encodes it again as WebP
-- without metadata, and stores the result with the service role. Without the
-- insert policies a direct Storage API upload, which could keep a camera's GPS
-- position, is refused. Deleting their own media still works as before.

update storage.buckets set allowed_mime_types = array['image/webp']
where id in ('media', 'message-media');

drop policy "People upload media for profiles they act as" on storage.objects;
drop policy "Participants upload message attachments" on storage.objects;

-- The same rules the insert policies kept: public media goes in the folder of
-- a profile you act as, message photos in a conversation you have accepted.
create function public.can_upload(p_bucket text, p_folder uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_active_member() and case p_bucket
    when 'media' then public.can_act_as(p_folder)
    when 'message-media' then public.is_accepted_participant(p_folder)
    else false
  end
$$;

revoke all on function public.can_upload(text, uuid) from public, anon;
grant execute on function public.can_upload(text, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Posts and messages only point at re-encoded files
-- ---------------------------------------------------------------------------

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
    select 1 from public.messages where id = new.reply_to_id and conversation_id = new.conversation_id
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

create or replace function public.create_post(
  p_body text,
  p_language text default 'en',
  p_author_id uuid default null,
  p_parent_id uuid default null,
  p_quote_id uuid default null,
  p_space_id uuid default null,
  p_link_url text default null,
  p_link_preview jsonb default null,
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

  select coalesce(array_agg(pr.id), '{}') into v_mentioned
  from public.profiles pr
  where pr.username = any (public.extract_mentions(v_body))
    and not public.is_blocked_between(pr.id, v_author)
    and not public.is_blocked_between(pr.id, auth.uid());

  insert into public.posts (
    author_id, created_by, body, language, parent_id, root_id, quote_id, space_id,
    event_id, opportunity_id, link_url, link_preview, topics, mentions
  ) values (
    v_author, auth.uid(), v_body, coalesce(nullif(lower(p_language), ''), 'en'),
    p_parent_id, coalesce(v_parent.root_id, v_parent.id), p_quote_id,
    coalesce(v_parent.space_id, p_space_id), p_event_id, p_opportunity_id,
    v_link, case when v_link is not null then p_link_preview end, public.extract_topics(v_body), v_mentioned
  )
  returning id into v_id;

  for v_image in select * from jsonb_array_elements(v_images) loop
    -- Uploads live in the uploader's own folder of the media bucket, as the
    -- WebP the server wrote, and the image shown is the public address of
    -- that upload, on whatever host serves the project's storage.
    if coalesce(v_image ->> 'path', '') !~ ('^' || auth.uid()::text || '/[A-Za-z0-9_/-]+\.webp$')
       or (v_image ->> 'url') is distinct from
          substring(v_image ->> 'url' from '^https?://[A-Za-z0-9.:-]+') || '/storage/v1/object/public/media/' || (v_image ->> 'path') then
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

  if public.has_good_reputation(auth.uid()) then
    perform public.publish_post(v_id);
  end if;

  return v_id;
end;
$$;
