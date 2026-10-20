-- Reference data every environment needs: cities and the official spaces.
-- Coordinates are city centroids, used only to work out which cities are near
-- each other.

insert into public.cities (slug, name, state, latitude, longitude) values
  ('brisbane', 'Brisbane', 'QLD', -27.4698, 153.0251),
  ('gold-coast', 'Gold Coast', 'QLD', -28.0167, 153.4000),
  ('sunshine-coast', 'Sunshine Coast', 'QLD', -26.6500, 153.0667),
  ('logan', 'Logan', 'QLD', -27.6392, 153.1094),
  ('ipswich', 'Ipswich', 'QLD', -27.6145, 152.7600),
  ('toowoomba', 'Toowoomba', 'QLD', -27.5606, 151.9539),
  ('townsville', 'Townsville', 'QLD', -19.2590, 146.8169),
  ('cairns', 'Cairns', 'QLD', -16.9186, 145.7781),
  ('rockhampton', 'Rockhampton', 'QLD', -23.3781, 150.5136),
  ('mackay', 'Mackay', 'QLD', -21.1411, 149.1861),
  ('bundaberg', 'Bundaberg', 'QLD', -24.8661, 152.3489),
  ('sydney', 'Sydney', 'NSW', -33.8688, 151.2093),
  ('western-sydney', 'Western Sydney', 'NSW', -33.8150, 151.0011),
  ('newcastle', 'Newcastle', 'NSW', -32.9283, 151.7817),
  ('wollongong', 'Wollongong', 'NSW', -34.4278, 150.8931),
  ('central-coast', 'Central Coast', 'NSW', -33.4250, 151.3420),
  ('wagga-wagga', 'Wagga Wagga', 'NSW', -35.1082, 147.3598),
  ('albury', 'Albury', 'NSW', -36.0737, 146.9135),
  ('armidale', 'Armidale', 'NSW', -30.5120, 151.6650),
  ('coffs-harbour', 'Coffs Harbour', 'NSW', -30.2963, 153.1135),
  ('canberra', 'Canberra', 'ACT', -35.2809, 149.1300),
  ('melbourne', 'Melbourne', 'VIC', -37.8136, 144.9631),
  ('geelong', 'Geelong', 'VIC', -38.1499, 144.3617),
  ('ballarat', 'Ballarat', 'VIC', -37.5622, 143.8503),
  ('bendigo', 'Bendigo', 'VIC', -36.7570, 144.2794),
  ('shepparton', 'Shepparton', 'VIC', -36.3833, 145.4000),
  ('mildura', 'Mildura', 'VIC', -34.2080, 142.1246),
  ('adelaide', 'Adelaide', 'SA', -34.9285, 138.6007),
  ('mount-gambier', 'Mount Gambier', 'SA', -37.8284, 140.7804),
  ('perth', 'Perth', 'WA', -31.9505, 115.8605),
  ('mandurah', 'Mandurah', 'WA', -32.5269, 115.7217),
  ('bunbury', 'Bunbury', 'WA', -33.3271, 115.6414),
  ('geraldton', 'Geraldton', 'WA', -28.7774, 114.6150),
  ('hobart', 'Hobart', 'TAS', -42.8821, 147.3272),
  ('launceston', 'Launceston', 'TAS', -41.4332, 147.1441),
  ('darwin', 'Darwin', 'NT', -12.4634, 130.8456),
  ('alice-springs', 'Alice Springs', 'NT', -23.6980, 133.8807)
on conflict (slug) do nothing;

insert into public.spaces (slug, name, description, kind, city_id, emoji, is_official)
select v.slug, v.name, v.description, 'city', c.id, v.emoji, true
from (values
  ('brisbane', 'Brisbane', 'News, meetups and recommendations for the community in Brisbane and South East Queensland.', 'brisbane', '🌉'),
  ('gold-coast', 'Gold Coast', 'The Gold Coast community: events, families, work and weekends.', 'gold-coast', '🏖️'),
  ('sydney', 'Sydney', 'Everything happening for the community across Sydney.', 'sydney', '🌆'),
  ('western-sydney', 'Western Sydney', 'Parramatta, Blacktown, Liverpool and beyond.', 'western-sydney', '🏘️'),
  ('melbourne', 'Melbourne', 'Melbourne''s community: culture, careers, food and footy.', 'melbourne', '☕'),
  ('geelong', 'Geelong', 'The community in Geelong and the Surf Coast.', 'geelong', '⚓'),
  ('perth', 'Perth', 'Perth and the wider WA community.', 'perth', '🌅'),
  ('adelaide', 'Adelaide', 'Adelaide and South Australia.', 'adelaide', '🍇'),
  ('canberra', 'Canberra', 'Canberra and the ACT.', 'canberra', '🏛️'),
  ('hobart', 'Hobart', 'Hobart and Tasmania.', 'hobart', '🏔️'),
  ('darwin', 'Darwin', 'Darwin and the Top End.', 'darwin', '🌴'),
  ('townsville', 'Townsville', 'Townsville and North Queensland.', 'townsville', '☀️'),
  ('newcastle', 'Newcastle', 'Newcastle and the Hunter.', 'newcastle', '🌊'),
  ('toowoomba', 'Toowoomba', 'Toowoomba and the Darling Downs.', 'toowoomba', '🌻')
) as v (slug, name, description, city_slug, emoji)
join public.cities c on c.slug = v.city_slug
on conflict (slug) do nothing;

insert into public.spaces (slug, name, description, kind, emoji, is_official)
select v.slug, v.name, v.description, v.kind::public.space_kind, v.emoji, true
from (values
  ('careers', 'Careers and Jobs', 'Job leads, CV help, interviews and career moves.', 'interest', '💼'),
  ('business', 'Business and Entrepreneurs', 'Founders, small business owners and side hustles supporting each other.', 'interest', '📈'),
  ('tech', 'Tech and Digital', 'Software, data, design and breaking into tech.', 'interest', '💻'),
  ('students', 'Students and Graduates', 'Uni, TAFE, scholarships and the first job after graduating.', 'interest', '🎓'),
  ('newcomers', 'Newcomers and Settlement', 'Visas, housing, schools, licences and finding your feet in Australia.', 'interest', '🧭'),
  ('parents', 'Parents and Families', 'Raising kids between cultures, schools and family life.', 'interest', '👨‍👩‍👧'),
  ('faith', 'Faith and Spirituality', 'Churches, mosques, fellowship and reflection.', 'interest', '🕊️'),
  ('food', 'Food and Recipes', 'Jollof debates, injera, ugali, where to buy ingredients and the best restaurants.', 'interest', '🍲'),
  ('arts', 'Music, Arts and Culture', 'Afrobeats, amapiano, film, fashion, writing and art.', 'interest', '🎶'),
  ('sport', 'Sport and Fitness', 'Football, basketball, running and community teams.', 'interest', '⚽'),
  ('health', 'Health and Wellbeing', 'Physical and mental health, finding a GP and looking after each other.', 'interest', '💚'),
  ('housing', 'Housing and Renting', 'Rentals, buying a first home and tenant rights.', 'interest', '🏠'),
  ('youth', 'Youth', 'For young people: school, sport, music and growing up here.', 'interest', '✨'),
  ('women', 'Women''s Network', 'A space for African Australian women to connect and lift each other up.', 'interest', '🌺'),
  ('heritage', 'Languages and Heritage', 'Keeping our languages, stories and traditions alive for the next generation.', 'interest', '🗣️'),
  ('advocacy', 'Community Leaders and Advocacy', 'Associations, community organisations, advocacy and civic life.', 'interest', '🤝')
) as v (slug, name, description, kind, emoji)
on conflict (slug) do nothing;
