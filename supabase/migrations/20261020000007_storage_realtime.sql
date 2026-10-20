-- Storage buckets and policies, and the tables streamed over Realtime.

create function public.try_uuid(p_value text)
returns uuid
language plpgsql
immutable
set search_path = ''
as $$
begin
  return p_value::uuid;
exception when invalid_text_representation then
  return null;
end;
$$;

-- Public images: avatars, banners, post images and event covers. Files live
-- under the folder of the profile they belong to: {profile_id}/{kind}/{file}.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('media', 'media', true, 8388608, array['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
on conflict (id) do nothing;

-- Private message attachments: {conversation_id}/{file}.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('message-media', 'message-media', false, 8388608, array['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
on conflict (id) do nothing;

create policy "Media is public" on storage.objects for select
  using (bucket_id = 'media');

create policy "People upload media for profiles they act as" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'media'
    and public.can_act_as(public.try_uuid((storage.foldername(name))[1]))
    and public.is_active_member()
  );

create policy "People delete media for profiles they act as" on storage.objects for delete to authenticated
  using (
    bucket_id = 'media'
    and public.can_act_as(public.try_uuid((storage.foldername(name))[1]))
  );

create policy "Participants read message attachments" on storage.objects for select to authenticated
  using (
    bucket_id = 'message-media'
    and public.is_participant(public.try_uuid((storage.foldername(name))[1]))
  );

create policy "Participants upload message attachments" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'message-media'
    and public.is_accepted_participant(public.try_uuid((storage.foldername(name))[1]))
    and public.is_active_member()
  );

-- Realtime: messages, reactions, read positions and notifications stream to
-- the browser. Realtime applies the same row level security as the API.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.messages;
    alter publication supabase_realtime add table public.conversation_participants;
    alter publication supabase_realtime add table public.message_reactions;
    alter publication supabase_realtime add table public.notifications;
  end if;
end;
$$;
