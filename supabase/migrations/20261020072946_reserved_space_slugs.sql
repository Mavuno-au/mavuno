-- Some addresses under /spaces are pages, so no space can take them. Mirrors
-- RESERVED_SPACE_SLUGS in src/lib/data/community.ts.
alter table public.spaces
  add constraint spaces_slug_not_a_page check (slug not in ('new', 'interests', 'joined'));
