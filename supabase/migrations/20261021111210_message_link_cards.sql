-- Link cards in messages. The first link in a message gets a card the server
-- fetches afterwards, through the same background task as a post's card. The
-- link is read from the message by a trigger, and only the service role can
-- write the card, so nobody can point a card at a link that isn't in the
-- message or forge its title and image. Members still cannot update a message
-- at all. Who can read the card is whoever can read the message.

-- ---------------------------------------------------------------------------
-- The first link in some text
-- ---------------------------------------------------------------------------

-- Mirrors the app's tokenizer (src/lib/text.ts): an http(s) link or a bare
-- www. address, ended by whitespace, angle brackets, quotes or an ellipsis,
-- with trailing punctuation and an unmatched closing bracket dropped.
create function public.first_url(p_text text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_url text := substring(coalesce(p_text, '') from '(?i)\m(https?://[^[:space:]<>"''“”‘’…]+|www\.[a-z0-9-]+\.[^[:space:]<>"''“”‘’…]+)');
begin
  if v_url is null then
    return null;
  end if;
  v_url := regexp_replace(v_url, '[].,;:!?''"]+$', '');
  while right(v_url, 1) = ')'
    and length(regexp_replace(v_url, '[^(]', '', 'g')) < length(regexp_replace(v_url, '[^)]', '', 'g')) loop
    v_url := regexp_replace(left(v_url, -1), '[].,;:!?''"]+$', '');
  end loop;
  if v_url ~* '^www\.' then
    v_url := 'https://' || v_url;
  end if;
  if char_length(v_url) > 2000 then
    return null;
  end if;
  return v_url;
end;
$$;

-- ---------------------------------------------------------------------------
-- Messages carry a link and, later, its card
-- ---------------------------------------------------------------------------

alter table public.messages
  add column link_url text check (link_url ~ '^https?://' and char_length(link_url) <= 2000),
  add column link_preview jsonb check (link_preview is null or jsonb_typeof(link_preview) = 'object');

-- The link comes from the body, never from the caller (the insert grant
-- doesn't cover these columns either).
create function public.set_message_link()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.link_url := public.first_url(new.body);
  new.link_preview := null;
  return new;
end;
$$;

create trigger messages_set_link before insert on public.messages
  for each row execute function public.set_message_link();

alter table public.background_tasks drop constraint background_tasks_target_type_check;
alter table public.background_tasks
  add constraint background_tasks_target_type_check check (target_type in ('post', 'event', 'opportunity', 'message'));

create function public.queue_message_link_preview()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.link_url is not null then
    insert into public.background_tasks (kind, target_type, target_id) values ('link_preview', 'message', new.id)
    on conflict do nothing;
  end if;
  return null;
end;
$$;

create trigger messages_queue_link_preview after insert on public.messages
  for each row execute function public.queue_message_link_preview();

-- ---------------------------------------------------------------------------
-- Writing a card, for a post or a message
-- ---------------------------------------------------------------------------

-- The checks set_link_preview made inline, so a message's card is held to
-- the same rules as a post's.
create function public.clean_link_preview(p_preview jsonb)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_url text := p_preview ->> 'url';
  v_title text := nullif(trim(p_preview ->> 'title'), '');
  v_description text := nullif(trim(p_preview ->> 'description'), '');
  v_image text := nullif(p_preview ->> 'image', '');
  v_site text := nullif(trim(p_preview ->> 'site_name'), '');
begin
  if jsonb_typeof(p_preview) is distinct from 'object'
     or coalesce(v_url, '') !~ '^https?://' or char_length(v_url) > 2000
     or v_title is null or char_length(v_title) > 300
     or char_length(v_description) > 500
     or (v_image is not null and (v_image !~ '^https://' or char_length(v_image) > 2000))
     or char_length(v_site) > 100 then
    raise exception 'Invalid link preview' using errcode = '22023';
  end if;
  return jsonb_build_object('url', v_url, 'title', v_title, 'description', v_description, 'image', v_image, 'site_name', v_site);
end;
$$;

create or replace function public.set_link_preview(p_post_id uuid, p_url text, p_preview jsonb)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.posts
  set link_preview = public.clean_link_preview(p_preview)
  where id = p_post_id and link_url = p_url and deleted_at is null;
$$;

create function public.set_message_link_preview(p_message_id uuid, p_url text, p_preview jsonb)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.messages
  set link_preview = public.clean_link_preview(p_preview)
  where id = p_message_id and link_url = p_url and removed_at is null;
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

revoke all on function
  public.first_url(text),
  public.set_message_link(),
  public.queue_message_link_preview(),
  public.clean_link_preview(jsonb),
  public.set_message_link_preview(uuid, text, jsonb)
from public, anon, authenticated;

grant execute on function public.set_message_link_preview(uuid, text, jsonb) to service_role;
