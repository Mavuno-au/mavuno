-- Trending's engagement has to double to keep up with a post a day newer,
-- instead of three hours newer. With only a few posts a day, three hours meant
-- a day-old conversation needed 256 times the engagement of a post nobody had
-- answered yet, so Trending showed the same newest posts as Latest.
--
-- The score still grows with time rather than decaying, so it only changes
-- when engagement does and nothing has to run on a schedule.
create or replace function public.refresh_hot_score(p_post_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.posts p set hot_score = ln(1 + coalesce((
      select sum(weight) from (
        select person, max(weight) as weight from (
          select l.user_id as person, 1 as weight from public.likes l where l.post_id = p.id
          union all
          select l.user_id, 1 from public.likes l
          join public.posts r on r.id = l.post_id
          where r.root_id = p.id and r.status = 'published' and r.deleted_at is null
          union all
          select r.created_by, 3 from public.posts r
          where (r.root_id = p.id or r.quote_id = p.id) and r.status = 'published' and r.deleted_at is null
        ) e
        where person is distinct from p.created_by
        group by person
      ) w
    ), 0)) / ln(2) + extract(epoch from coalesce(p.published_at, p.created_at)) / 86400.0
  where p.id = p_post_id
$$;

-- Stored scores are on the old scale: any post rescored after this would rank
-- above every post that was not. Posts still at 0 were never published.
do $$
begin
  perform public.refresh_hot_score(p.id) from public.posts p where p.hot_score <> 0;
end;
$$;
