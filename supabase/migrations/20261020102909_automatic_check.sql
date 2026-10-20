-- An automatic check that holds posts for a person to decide; it never
-- rejects anything.
--
-- When OPENAI_API_KEY is set, the app sends new posts from members without a
-- track record to OpenAI's moderation model, after the post is created. If the
-- model flags it, automatic_hold takes the post back to pending and keeps the
-- categories for moderators. Models are weaker in Swahili, Somali and Amharic
-- than in English, so a moderator always makes the decision, and a check that
-- fails changes nothing.

create table public.post_flags (
  post_id uuid primary key references public.posts (id) on delete cascade,
  categories text[] not null check (cardinality(categories) between 1 and 20),
  created_at timestamptz not null default now()
);

alter table public.post_flags enable row level security;

create policy "Moderators see automatic flags" on public.post_flags for select to authenticated
  using ((select public.is_moderator()));

revoke all on table public.post_flags from public, anon, authenticated;
grant select on table public.post_flags to authenticated;
grant all on table public.post_flags to service_role;

-- What the check reads, or null when the post needs no check: it is gone,
-- rejected or already checked, or its writer has a track record. A track
-- record is has_good_reputation as it reads with premoderation on (a member
-- for an hour who had a post published before this one), so new members'
-- posts are checked while they go up straight away. Moderators are never
-- checked.
create function public.automatic_check_subject(p_post_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'text', concat_ws(E'\n', nullif(p.body, ''), (
      select string_agg(o.label, E'\n' order by o.position) from public.poll_options o where o.post_id = p.id
    )),
    'images', (
      select coalesce(jsonb_agg(i.url order by i.position), '[]'::jsonb) from public.post_images i where i.post_id = p.id
    )
  )
  from public.posts p
  where p.id = p_post_id and p.deleted_at is null and p.status <> 'rejected'
    and not exists (select 1 from public.post_flags f where f.post_id = p.id)
    and not exists (select 1 from public.profile_settings s where s.id = p.created_by and s.site_role in ('moderator', 'admin'))
    and not (
      public.has_good_reputation(p.created_by)
      and exists (select 1 from public.profiles pr where pr.id = p.created_by and pr.created_at < now() - interval '1 hour')
      and exists (
        select 1 from public.posts earlier
        where earlier.created_by = p.created_by and earlier.id <> p.id
          and earlier.published_at is not null and earlier.created_at < p.created_at
      )
    )
$$;

create function public.automatic_hold(p_post_id uuid, p_categories text[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_post public.posts;
begin
  if coalesce(cardinality(p_categories), 0) not between 1 and 20
     or exists (select 1 from unnest(p_categories) as c where c !~ '^[a-z][a-z/_-]{0,39}$') then
    raise exception 'Invalid categories' using errcode = '22023';
  end if;

  select * into v_post from public.posts
  where id = p_post_id and deleted_at is null and status <> 'rejected' for update;
  if v_post.id is null then
    return;
  end if;

  insert into public.post_flags (post_id, categories) values (p_post_id, p_categories)
  on conflict (post_id) do update set categories = excluded.categories, created_at = now();

  if v_post.status = 'published' then
    update public.posts set status = 'pending', moderation_note = 'Held for review after an automatic check'
    where id = p_post_id;
    perform public.count_post(v_post, -1);
  end if;
end;
$$;

-- Flags describe a post's content, so they go when it is deleted.
create function public.forget_post_flags()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.post_flags where post_id = new.id;
  return null;
end;
$$;

create trigger posts_forget_flags after update of deleted_at on public.posts
  for each row when (old.deleted_at is null and new.deleted_at is not null)
  execute function public.forget_post_flags();

-- The review queue shows what the check flagged.
create or replace view public.review_queue
with (security_invoker = true)
as
select 'post'::public.report_target as target_type, p.id as target_id, p.author_id as profile_id, p.created_by,
  p.body as content, p.language, p.moderation_note as note, p.parent_id, p.created_at,
  (select f.categories from public.post_flags f where f.post_id = p.id) as flags
from public.posts p
where p.status = 'pending' and p.deleted_at is null and public.is_moderator()
union all
select 'event', e.id, e.host_id, e.created_by, e.title || E'\n\n' || e.description, 'en', null, null, e.created_at, null
from public.events e where e.status = 'pending' and public.is_moderator()
union all
select 'opportunity', o.id, o.poster_id, o.created_by, o.title || E'\n\n' || o.description, 'en', null, null, o.created_at, null
from public.opportunities o where o.status = 'pending' and public.is_moderator();

revoke all on function
  public.automatic_check_subject(uuid),
  public.automatic_hold(uuid, text[]),
  public.forget_post_flags()
from public, anon, authenticated;

grant execute on function
  public.automatic_check_subject(uuid),
  public.automatic_hold(uuid, text[])
to service_role;
