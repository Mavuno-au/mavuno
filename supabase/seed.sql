-- Demo data for local development only (`pnpm db:reset`). Never run it against
-- production. Every demo account's password is: mavuno-demo
-- Sign in as amara@example.com (admin), kofi@example.com, hana@example.com or
-- tendai@example.com.

-- New members' posts aren't held for review unless an admin turns it on.
update public.site_settings set premoderation = false;

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change_token_new, email_change)
select
  '00000000-0000-0000-0000-000000000000', u.id::uuid, 'authenticated', 'authenticated', u.email,
  extensions.crypt('mavuno-demo', extensions.gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}', jsonb_build_object('username', u.username, 'display_name', u.name),
  now() - interval '30 days', now(), '', '', '', ''
from (values
  ('a0000000-0000-4000-8000-000000000001', 'amara@example.com', 'amara', 'Amara Okafor'),
  ('a0000000-0000-4000-8000-000000000002', 'kofi@example.com', 'kofi', 'Kofi Mensah'),
  ('a0000000-0000-4000-8000-000000000003', 'hana@example.com', 'hana', 'Hana Tesfaye'),
  ('a0000000-0000-4000-8000-000000000004', 'tendai@example.com', 'tendai', 'Tendai Moyo')
) as u (id, email, username, name);

insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
select gen_random_uuid(), u.id, u.id::text, jsonb_build_object('sub', u.id::text, 'email', u.email), 'email', now(), now(), now()
from auth.users u where u.email like '%@example.com';

update public.profiles p set
  bio = v.bio, city_id = (select id from public.cities where slug = v.city), heritage = v.heritage,
  languages = v.languages, interests = v.interests, headline = v.headline, created_at = now() - interval '30 days'
from (values
  ('amara', 'Software engineer and mentor. Building community in Brisbane.', 'brisbane', 'Nigerian-Australian', '{en,ig,yo}'::text[], '{tech,careers,food}'::text[], 'Engineering lead'),
  ('kofi', 'Small business owner in Logan. Football on weekends.', 'logan', 'Ghanaian-Australian', '{en,ak}'::text[], '{business,football}'::text[], 'Founder, Mensah Foods'),
  ('hana', 'Nurse in Perth. Coffee ceremony enthusiast.', 'perth', 'Ethiopian-Australian', '{en,am}'::text[], '{health,food,faith}'::text[], 'Registered nurse'),
  ('tendai', 'Student at UQ, studying data science.', 'brisbane', 'Zimbabwean-Australian', '{en,sn}'::text[], '{tech,education,music}'::text[], null)
) as v (username, bio, city, heritage, languages, interests, headline)
where p.username = v.username;

update public.profile_settings set onboarded_at = now(), age_confirmed_at = now() where id in (select id from public.profiles where username in ('amara', 'kofi', 'hana', 'tendai'));
update public.profile_settings set site_role = 'admin' where id = (select id from public.profiles where username = 'amara');

insert into public.follows (follower_id, followee_id)
select a.id, b.id from public.profiles a, public.profiles b
where a.username in ('amara', 'kofi', 'hana', 'tendai') and b.username in ('amara', 'kofi', 'hana', 'tendai') and a.id <> b.id;

insert into public.space_members (space_id, user_id)
select s.id, p.id from public.spaces s, public.profiles p
where (s.slug, p.username) in (('brisbane', 'amara'), ('brisbane', 'kofi'), ('brisbane', 'tendai'), ('perth', 'hana'), ('tech', 'amara'), ('tech', 'tendai'), ('careers', 'amara'), ('business', 'kofi'), ('food', 'hana'));

-- Posts are created through the same function the app uses, as each author.
do $$
declare
  v_amara uuid := (select id from public.profiles where username = 'amara');
  v_kofi uuid := (select id from public.profiles where username = 'kofi');
  v_hana uuid := (select id from public.profiles where username = 'hana');
  v_tendai uuid := (select id from public.profiles where username = 'tendai');
  v_post uuid;
  v_org uuid;
begin
  perform set_config('request.jwt.claim.sub', v_amara::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_amara, 'role', 'authenticated')::text, true);
  v_post := public.create_post('Welcome to Mavuno! Introduce yourself below: where are you based and what are you working on? #introductions');
  v_org := public.create_organisation('brisbane_african_assoc', 'Brisbane African Association', 'Bringing the African community in Brisbane together since 2009.', 'Community association', (select id from public.cities where slug = 'brisbane'));
  insert into public.events (host_id, created_by, title, description, category, starts_at, ends_at, timezone, city_id, venue_name, address)
  values (v_org, v_amara, 'AfroFest Brisbane', 'Music, food stalls and dance from across the continent. Bring the whole family.', 'cultural',
    date_trunc('day', now()) + interval '9 days 11 hours', date_trunc('day', now()) + interval '9 days 18 hours', 'Australia/Brisbane',
    (select id from public.cities where slug = 'brisbane'), 'King George Square', 'King George Square, Brisbane City QLD');
  insert into public.opportunities (poster_id, created_by, type, title, organisation_name, description, city_id, apply_url, deadline_at, tags)
  values (v_amara, v_amara, 'mentoring', 'Free tech mentoring for students', 'Amara Okafor', 'One hour a fortnight with an engineer, for African Australian students starting out in software or data.', (select id from public.cities where slug = 'brisbane'), 'https://example.org/mentoring', now() + interval '21 days', '{tech,students}');

  perform set_config('request.jwt.claim.sub', v_kofi::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_kofi, 'role', 'authenticated')::text, true);
  perform public.create_post('Kofi here, from Logan. We just started stocking shito and kenkey at the shop on Kingston Rd. Come say hi!', 'en', null, v_post);
  perform public.create_post('Which jollof wins?', 'en', null, null, null, null, null, null, '[]'::jsonb, '{"options": ["Ghanaian", "Nigerian", "Senegalese"], "duration_hours": 72}'::jsonb);

  perform set_config('request.jwt.claim.sub', v_hana::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_hana, 'role', 'authenticated')::text, true);
  perform public.create_post('Selam from Perth! Hospital is hiring graduate nurses this year. Happy to answer questions about the process. #careers');

  perform set_config('request.jwt.claim.sub', v_tendai::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_tendai, 'role', 'authenticated')::text, true);
  perform public.create_post('Anyone else at UQ? Starting a study group for first-years in data science. #students #tech', 'en', null, null, null, (select id from public.spaces where slug = 'brisbane'));
end;
$$;
