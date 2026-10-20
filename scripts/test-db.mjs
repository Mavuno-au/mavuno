// Applies every migration to an embedded Postgres (PGlite) with Supabase
// stand-ins, then checks the schema, policies, triggers and functions end to end.
//
//   pnpm test:db

import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const db = new PGlite({ extensions: { pg_trgm, pgcrypto } });

let passed = 0;
let failed = 0;

function check(name, condition, detail) {
  if (condition) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.log(`  ✗ ${name}${detail === undefined ? "" : ` — ${JSON.stringify(detail)}`}`);
  }
}

const superuser = () => db.exec("reset role; select set_config('request.jwt.claim.sub', '', false);");
const as = (id) => db.exec(`reset role; select set_config('request.jwt.claim.sub', '${id}', false); set role authenticated;`);
const anon = () => db.exec("reset role; select set_config('request.jwt.claim.sub', '', false); set role anon;");
const q = async (sql, params = []) => (await db.query(sql, params)).rows;
const one = async (sql, params = []) => (await q(sql, params))[0];

async function fails(name, sql, params, pattern) {
  try {
    await db.query(sql, params ?? []);
    check(name, false, "expected an error");
  } catch (error) {
    check(name, pattern ? pattern.test(error.message) : true, error.message);
  }
}

// Members confirm their age when they sign up; pass age_confirmed: false for someone who hasn't.
async function createUser(email, meta) {
  await superuser();
  return (await one("insert into auth.users (email, raw_user_meta_data) values ($1, $2) returning id", [email, JSON.stringify({ age_confirmed: true, ...meta })])).id;
}

const post = async (body, ...args) => {
  const params = [body, ...args];
  const placeholders = params.map((_, i) => `$${i + 1}`).join(", ");
  return (await one(`select public.create_post(${placeholders}) as id`, params)).id;
};

const MEDIA = "https://x.supabase.co/storage/v1/object/public/media/";

const stubs = readFileSync(join(root, "supabase/tests/supabase-stubs.sql"), "utf8");

console.log("Applying migrations");
await db.exec(stubs);
const dir = join(root, "supabase/migrations");
for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
  try {
    await db.exec(readFileSync(join(dir, file), "utf8"));
    console.log(`  ✓ ${file}`);
  } catch (error) {
    console.log(`  ✗ ${file}: ${error.message}`);
    process.exit(1);
  }
}

const city = async (slug) => (await one("select id from public.cities where slug = $1", [slug])).id;
const brisbane = await city("brisbane");
const logan = await city("logan");
const perth = await city("perth");

console.log("\nProfiles and settings");
const amara = await createUser("amara@example.com", { username: "Amara", display_name: "Amara Okafor" });
const kofi = await createUser("kofi@example.com", { username: "kofi", display_name: "Kofi Mensah" });
const hana = await createUser("hana@example.com", { username: "hana_t", full_name: "Hana Tesfaye" });
const taken = await createUser("x@example.com", { username: "admin" });
const mod = await createUser("mod@example.com", { username: "jo_moderates" });

let row = await one("select username, display_name from public.profiles where id = $1", [amara]);
check("profile comes from sign-up details, username lowercased", row.username === "amara" && row.display_name === "Amara Okafor", row);
row = await one("select username from public.profiles where id = $1", [taken]);
check("a reserved username falls back to a generated one", row.username.startsWith("member_"), row);
row = await one("select count(*)::int as n from public.profile_settings");
check("every profile gets private settings", row.n === 5, row);

await superuser();
await q("update public.profile_settings set site_role = 'moderator' where id = $1", [mod]);
await q("update public.profiles set city_id = $2, interests = '{tech,football}' where id = $1", [amara, brisbane]);
await q("update public.profiles set city_id = $2, interests = '{tech}' where id = $1", [kofi, logan]);
await q("update public.profiles set city_id = $2 where id = $1", [hana, perth]);

await as(amara);
await q("update public.profiles set bio = 'Engineer in Brisbane' where id = $1", [amara]);
check("people edit their own profile", (await one("select bio from public.profiles where id = $1", [amara])).bio === "Engineer in Brisbane");
await q("update public.profiles set bio = 'hacked' where id = $1", [kofi]);
check("people cannot edit someone else's profile", (await one("select bio from public.profiles where id = $1", [kofi])).bio === "");
await fails("people cannot make themselves moderators", "update public.profile_settings set site_role = 'admin' where id = $1", [amara], /permission denied/);
await fails("reserved usernames cannot be claimed", "update public.profiles set username = 'support' where id = $1", [amara], /reserved/);
await q("update public.profile_settings set translation_language = 'sw' where id = $1", [amara]);
await as(kofi);
let rows = await q("select * from public.profile_settings");
check("settings are private to their owner", rows.length === 1 && rows[0].id === kofi, rows.length);

console.log("\nPremoderation");
await superuser();
check("new members aren't held for review by default", (await one("select premoderation from public.site_settings")).premoderation === false);
await q("update public.site_settings set premoderation = true");
await as(amara);
const first = await post("My first post on Mavuno!");
row = await one("select status from public.posts where id = $1", [first]);
check("a new member's first post waits for review", row.status === "pending", row);
rows = await q("select id from public.feed_latest()");
check("authors see their own pending posts in feeds", rows.some((r) => r.id === first));
await as(kofi);
rows = await q("select id from public.feed_latest()");
check("pending posts are hidden from everyone else", !rows.some((r) => r.id === first));
await anon();
rows = await q("select id from public.posts where id = $1", [first]);
check("guests cannot read pending posts", rows.length === 0);
await as(mod);
rows = await q("select target_id from public.review_queue");
check("pending posts appear in the review queue", rows.some((r) => r.target_id === first), rows);
await q("select public.moderate_content('post', $1, true)", [first]);
await superuser();
await q("update public.profiles set created_at = now() - interval '2 hours' where id = $1", [amara]);
await as(amara);
const second = await post("Second post goes straight out");
check("members with a good reputation publish at once", (await one("select status from public.posts where id = $1", [second])).status === "published");
await as(mod);
check("moderators publish at once", (await one("select status from public.posts where id = $1", [await post("Welcome everyone")])).status === "published");

// The remaining checks run without premoderation.
await superuser();
await q("update public.site_settings set premoderation = false");

console.log("\nFollows");
await as(kofi);
await q("insert into public.follows (follower_id, followee_id) values ($1, $2)", [kofi, amara]);
check("following counts", (await one("select followers_count from public.profiles where id = $1", [amara])).followers_count === 1);
await q("delete from public.follows where follower_id = $1", [kofi]);
await q("insert into public.follows (follower_id, followee_id) values ($1, $2)", [kofi, amara]);
await as(amara);
row = await one("select count(*)::int as n from public.notifications where recipient_id = $1 and type = 'follow'", [amara]);
check("a follower notifies only once, even after refollowing", row.n === 1, row);
await fails("people cannot follow for someone else", "insert into public.follows (follower_id, followee_id) values ($1, $2)", [hana, amara], /row-level security/);

console.log("\nPosts, replies and quotes");
await as(amara);
const post1 = await post("Who's coming to the #AfroFest meetup? cc @kofi and email me at amara@example.com", "en");
row = await one("select topics, mentions from public.posts where id = $1", [post1]);
check("hashtags become topics", JSON.stringify(row.topics) === '["afrofest"]', row.topics);
check("mentions resolve, email addresses do not", row.mentions.length === 1 && row.mentions[0] === kofi, row.mentions);
await as(kofi);
check("mentions notify", (await one("select count(*)::int as n from public.notifications where recipient_id = $1 and type = 'mention'", [kofi])).n === 1);
await fails("empty posts are rejected", "select public.create_post('   ')", [], /Write something/);
await fails("nobody posts as someone else", "select public.create_post('hi', 'en', $1)", [amara], /cannot post as/);
await fails("posts are written through create_post only", "insert into public.posts (author_id, body) values ($1, 'x')", [kofi], /permission denied/);
await fails("posts cannot be edited", "update public.posts set body = 'edited' where id = $1", [post1], /permission denied/);

const reply1 = await post("Count me in!", "en", null, post1);
check("replies count", (await one("select reply_count from public.posts where id = $1", [post1])).reply_count === 1);
check("replies record their thread", (await one("select root_id from public.posts where id = $1", [reply1])).root_id === post1);
const quote1 = await post("The event of the year, @amara", "en", null, null, post1);
check("quotes count", (await one("select quote_count from public.posts where id = $1", [post1])).quote_count === 1);
await fails("a reply cannot also quote", "select public.create_post('x', 'en', null, $1, $1)", [post1]);
rows = await q("select id from public.post_replies($1)", [post1]);
check("replies and quotes are listed under the post", rows.length === 2, rows.length);
await as(amara);
row = await one("select count(*)::int as n from public.notifications where recipient_id = $1 and type in ('reply', 'quote', 'mention')", [amara]);
check("reply and quote notify once, without a duplicate mention", row.n === 2, row);

console.log("\nLikes and trending");
await as(kofi);
const before = (await one("select hot_score from public.posts where id = $1", [post1])).hot_score;
await q("insert into public.likes (user_id, post_id) values ($1, $2)", [kofi, post1]);
check("likes count", (await one("select like_count from public.posts where id = $1", [post1])).like_count === 1);
const after = (await one("select hot_score from public.posts where id = $1", [post1])).hot_score;
check("replies and likes raise the trending score", after > before || after > 0, { before, after });
await fails("people cannot like their own posts", "insert into public.likes (user_id, post_id) values ($1, $2)", [kofi, reply1], /row-level security/);
await as(amara);
check("likes notify the author", (await one("select count(*)::int as n from public.notifications where type = 'like' and recipient_id = $1", [amara])).n === 1);
await as(kofi);
await q("delete from public.likes where user_id = $1 and post_id = $2", [kofi, post1]);
await as(amara);
check("unliking removes the notification", (await one("select count(*)::int as n from public.notifications where type = 'like' and recipient_id = $1", [amara])).n === 0);
await as(kofi);
await q("insert into public.likes (user_id, post_id) values ($1, $2)", [kofi, post1]);
row = await one("select liked, saved, author->>'username' as author, quoted from public.post_details where id = $1", [post1]);
check("post details carry viewer state and author", row.liked && !row.saved && row.author === "amara", row);
check("people see their own likes", (await q("select 1 from public.likes where post_id = $1", [post1])).length === 1);
await as(amara);
check("nobody lists who liked a post", (await q("select 1 from public.likes where post_id = $1", [post1])).length === 0);
check("like counts stay public", (await one("select like_count from public.posts where id = $1", [post1])).like_count === 1);
await anon();
check("guests cannot list likes", (await q("select 1 from public.likes")).length === 0);
await as(kofi);
row = await one("select quoted->'author'->>'username' as u from public.post_details where id = $1", [quote1]);
check("quotes embed the original", row.u === "amara", row);

console.log("\nImages and polls");
await as(amara);
await fails("images must be in the uploader's folder", "select public.create_post('pic', 'en', null, null, null, null, null, null, $1::jsonb)",
  [JSON.stringify([{ path: `${kofi}/posts/a.webp`, url: `${MEDIA}${kofi}/posts/a.webp` }])], /Invalid image/);
const imgPost = await post("Jollof night", "en", null, null, null, null, null, null,
  JSON.stringify([{ path: `${amara}/posts/a.webp`, url: `${MEDIA}${amara}/posts/a.webp`, width: 800, height: 600, alt: "A pot of jollof rice" }]));
row = await one("select images from public.post_details where id = $1", [imgPost]);
check("images are attached with descriptions", row.images[0]?.alt === "A pot of jollof rice", row);
const poll = await post("Best jollof?", "en", null, null, null, null, null, null, "[]", JSON.stringify({ options: ["Nigerian", "Ghanaian", "Senegalese"], duration_hours: 24 }));
await fails("polls need 2 to 4 different options", "select public.create_post('Poll', 'en', null, null, null, null, null, null, '[]'::jsonb, $1::jsonb)",
  [JSON.stringify({ options: ["Same", "Same"] })], /different options/);
await fails("polls run 1 hour, 1, 3 or 7 days", "select public.create_post('Poll', 'en', null, null, null, null, null, null, '[]'::jsonb, $1::jsonb)",
  [JSON.stringify({ options: ["A", "B"], duration_hours: 5 })]);
const options = await q("select id from public.poll_options where post_id = $1 order by position", [poll]);
await fails("authors cannot vote in their own poll", "select public.vote_poll($1, $2)", [poll, options[0].id], /own poll/);
await as(hana);
row = await one("select poll from public.post_details where id = $1", [poll]);
check("results stay hidden until you vote", row.poll.show_results === false && row.poll.options[0].votes_count === null, row.poll);
await q("select public.vote_poll($1, $2)", [poll, options[1].id]);
await fails("people vote once", "select public.vote_poll($1, $2)", [poll, options[0].id], /already voted/);
row = await one("select poll from public.post_details where id = $1", [poll]);
check("voters see results and their vote", row.poll.show_results && row.poll.my_vote === options[1].id && row.poll.options[1].votes_count === 1, row.poll);
check("polls close after their duration from publication", new Date(row.poll.closes_at) > new Date(), row.poll.closes_at);

console.log("\nFeeds, discovery and search");
await as(kofi);
rows = await q("select id from public.feed_following()");
check("following feed has followed people's posts", rows.some((r) => r.id === post1));
check("following feed leaves out replies", !rows.some((r) => r.id === reply1));
check("trending ranks recent posts", (await q("select post->>'id' as id from public.feed_trending()")).length >= 3);
check("trending topics are counted", (await q("select topic from public.trending_topics()")).some((r) => r.topic === "afrofest"));
rows = await q("select id from public.post_ancestors($1)", [reply1]);
check("a reply's ancestors resolve", rows.length === 1 && rows[0].id === post1, rows);
check("people search matches partial names", (await q("select username from public.search_profiles('amar')")).some((r) => r.username === "amara"));
check("post search matches words", (await q("select id from public.search_posts('jollof')")).length === 2);
rows = await q("select username from public.nearby_profiles($1::smallint)", [logan]);
check("nearby includes nearby cities", rows.some((r) => r.username === "amara"), rows);
check("nearby leaves out distant cities", !rows.some((r) => r.username === "hana_t"), rows);
await superuser();
await q("update public.profile_settings set discoverable = false where id = $1", [amara]);
await as(kofi);
check("people can opt out of nearby", !(await q("select username from public.nearby_profiles($1::smallint)", [logan])).some((r) => r.username === "amara"));
await superuser();
await q("update public.profile_settings set discoverable = true where id = $1", [amara]);
await as(hana);
rows = await q("select username, reason from public.suggested_profiles(10)");
check("suggestions explain themselves", rows.length > 0 && rows.every((r) => r.reason), rows);
check("new-post counts power the 'new posts' control", (await one("select public.count_new_posts('latest', now() - interval '1 hour') as n")).n >= 3);
await anon();
rows = await q("select id, liked from public.feed_latest()");
check("guests read the latest feed", rows.length >= 3 && rows.every((r) => r.liked === false));
await fails("guests cannot like", "insert into public.likes (user_id, post_id) values ($1, $2)", [kofi, post1]);

console.log("\nSaved posts");
await as(kofi);
await q("insert into public.saves (user_id, post_id) values ($1, $2)", [kofi, post1]);
check("saved posts are listed", (await q("select post->>'id' as id from public.feed_saved()"))[0]?.id === post1);
await as(amara);
check("saved posts are private", (await q("select * from public.saves")).length === 0);

console.log("\nMutes and blocks");
await as(hana);
const hanaPost = await post("Greetings from Perth");
await as(kofi);
await q("insert into public.mutes (muter_id, muted_id) values ($1, $2)", [kofi, hana]);
check("muted people leave feeds", !(await q("select id from public.feed_latest()")).some((r) => r.id === hanaPost));
check("muted people's profiles still show their posts", (await q("select id from public.feed_profile($1)", [hana])).some((r) => r.id === hanaPost));
await q("delete from public.mutes where muter_id = $1", [kofi]);
await as(amara);
await q("insert into public.blocks (blocker_id, blocked_id) values ($1, $2)", [amara, kofi]);
check("blocking removes follows", (await one("select followers_count from public.profiles where id = $1", [amara])).followers_count === 0);
await as(kofi);
check("blocked people's posts disappear for both", !(await q("select id from public.feed_latest()")).some((r) => r.id === post1));
await fails("blocked people cannot reply", "select public.create_post('hey', 'en', null, $1)", [post1], /no longer available|cannot reply/);
await fails("blocked people cannot follow", "insert into public.follows (follower_id, followee_id) values ($1, $2)", [kofi, amara], /row-level security/);
await as(amara);
await q("delete from public.blocks where blocker_id = $1", [amara]);

console.log("\nThread continuation");
{
  await as(amara);
  const opener = await post("A thread about settling in Brisbane");
  await as(kofi);
  const other = await post("Great thread", "en", null, opener);
  await as(amara);
  const part2 = await post("First, find a room", "en", null, opener);
  const aside = await post("A later reply to myself", "en", null, opener);
  const part3 = await post("Then, find work", "en", null, part2);
  const part4 = await post("Finally, find your people", "en", null, part3);
  const ids = async (sql, params) => (await q(sql, params)).map((r) => r.id);
  const same = (actual, expected) => JSON.stringify(actual) === JSON.stringify(expected);

  await as(kofi);
  let thread = await ids("select id from public.post_continuation($1)", [opener]);
  check("the author's earliest self-replies continue the post in order", same(thread, [part2, part3, part4]), thread);
  thread = await ids("select id from public.post_continuation($1, 2)", [opener]);
  check("the thread reads a page at a time", same(thread, [part2, part3]), thread);
  thread = await ids("select id from public.post_continuation($1)", [part3]);
  check("the next page is the thread of the last post shown", same(thread, [part4]), thread);
  rows = await q("select id, continuation_count, reply_count from public.post_details where id = any($1)", [[opener, part2, part4, other]]);
  const counted = Object.fromEntries(rows.map((r) => [r.id, r.continuation_count]));
  check("post details count the posts that continue each post", counted[opener] === 3 && counted[part2] === 2 && counted[part4] === 0 && counted[other] === 0, counted);
  thread = await ids("select id from public.post_replies($1)", [opener]);
  check("the continuing post is left out of the replies", !thread.includes(part2) && thread.includes(other) && thread.includes(aside), thread);
  const positions = await q("select public.thread_position($1) as a, public.thread_position($2) as b, public.thread_position($3) as c, public.thread_position($4) as d", [opener, part3, aside, other]);
  check("posts know their place in the thread", same(positions[0], { a: 1, b: 3, c: 1, d: 1 }), positions[0]);

  await anon();
  check("guests read threads", (await q("select id from public.post_continuation($1)", [opener])).length === 3);

  await as(kofi);
  await q("insert into public.mutes (muter_id, muted_id) values ($1, $2)", [kofi, amara]);
  check("a muted author's thread is hidden", (await q("select id from public.post_continuation($1)", [opener])).length === 0);
  await q("delete from public.mutes where muter_id = $1", [kofi]);

  await as(amara);
  await q("select public.delete_post($1)", [part3]);
  thread = await ids("select id from public.post_continuation($1)", [opener]);
  check("a deleted post ends the thread", same(thread, [part2]), thread);
  await q("select public.restore_post($1)", [part3]);
  await q("select public.delete_post($1)", [part2]);
  thread = await ids("select id from public.post_continuation($1)", [opener]);
  check("the next earliest self-reply continues the post when the first is deleted", same(thread, [aside]), thread);
  await q("select public.restore_post($1)", [part2]);

  await as(hana);
  await q("insert into public.blocks (blocker_id, blocked_id) values ($1, $2)", [hana, amara]);
  check("a blocked author's thread is hidden", (await q("select id from public.post_continuation($1)", [opener])).length === 0);
  await q("delete from public.blocks where blocker_id = $1", [hana]);

  // Keeps Amara under the posting rate limit for the checks that follow.
  await superuser();
  await q("update public.posts set created_at = created_at - interval '5 minutes' where id = any($1)", [[opener, part2, aside, part3, part4]]);
}

console.log("\nMessages");
await as(hana);
const conv = (await one("select public.start_direct_conversation($1) as id", [amara])).id;
await q("insert into public.messages (conversation_id, sender_id, body) values ($1, $2, 'Hi Amara!')", [conv, hana]);
await fails("a request allows one message until accepted", "insert into public.messages (conversation_id, sender_id, body) values ($1, $2, 'Hello??')", [conv, hana], /waiting/);
await as(amara);
row = await one("select my_status, unread_count from public.conversation_list where id = $1", [conv]);
check("people you don't follow land in Requests", row.my_status === "pending" && row.unread_count === 1, row);
await fails("requests must be accepted before replying", "insert into public.messages (conversation_id, sender_id, body) values ($1, $2, 'Hi')", [conv, amara], /row-level security/);
await q("select public.respond_to_message_request($1, true)", [conv]);
await q("insert into public.messages (conversation_id, sender_id, body) values ($1, $2, 'Hello Hana')", [conv, amara]);
check("your own messages are not unread", (await one("select public.unread_message_count() as n")).n === 0);
await as(hana);
check("new messages are unread", (await one("select public.unread_message_count() as n")).n === 1);
check("starting again reuses the conversation", (await one("select public.start_direct_conversation($1) as id", [amara])).id === conv);
row = await one("select members->0->>'read_at' as read_at from public.conversation_list where id = $1", [conv]);
check("read receipts show when both people share them", row.read_at !== null, row);
const msg = (await one("select id from public.messages where conversation_id = $1 and sender_id = $2", [conv, amara])).id;
await q("insert into public.message_reactions (message_id, user_id, emoji) values ($1, $2, '❤️')", [msg, hana]);
check("people react to messages", (await one("select count(*)::int as n from public.message_reactions")).n === 1);
await fails("messages cannot be edited", "update public.messages set body = 'x' where id = $1", [msg], /permission denied/);
await as(kofi);
check("outsiders cannot read conversations", (await q("select * from public.messages where conversation_id = $1", [conv])).length === 0);
await q("insert into public.follows (follower_id, followee_id) values ($1, $2)", [kofi, amara]);
await as(amara);
await q("insert into public.follows (follower_id, followee_id) values ($1, $2)", [amara, kofi]);
const group = (await one("select public.create_group_conversation('Brisbane crew', $1::uuid[]) as id", [`{${kofi},${hana}}`])).id;
rows = await q("select user_id, status from public.conversation_participants where conversation_id = $1", [group]);
check("participants only read their own participation row", rows.length === 1 && rows[0].user_id === amara, rows);
row = await one("select members from public.conversation_list where id = $1", [group]);
check("group invites follow the request rules", row.members.find((m) => m.id === kofi)?.status === "accepted" && row.members.find((m) => m.id === hana)?.status === "pending", row.members);

console.log("\nMessage privacy");
await as(hana);
check("other people's read positions are not readable", (await q("select * from public.conversation_participants where conversation_id = $1", [conv])).every((r) => r.user_id === hana));
await superuser();
await q("update public.profile_settings set read_receipts = false where id = $1", [amara]);
await as(hana);
check("read times are hidden when the other person turned receipts off", (await one("select members->0->>'read_at' as read_at from public.conversation_list where id = $1", [conv])).read_at === null);
await superuser();
await q("update public.profile_settings set read_receipts = true where id = $1", [amara]);
await q("update public.profile_settings set read_receipts = false where id = $1", [hana]);
await as(hana);
check("read times are hidden when you turned receipts off", (await one("select public.shared_read_at($1, $2) as at", [conv, amara])).at === null);
await as(amara);
check("people with receipts off don't share their read time", (await one("select members->0->>'read_at' as read_at from public.conversation_list where id = $1", [conv])).read_at === null);
await superuser();
await q("update public.profile_settings set read_receipts = true where id = $1", [hana]);

await as(taken);
check("people can message someone new", (await one("select public.can_message($1) as ok", [amara])).ok === true);
const declined = (await one("select public.start_direct_conversation($1) as id", [amara])).id;
await q("insert into public.messages (conversation_id, sender_id, body) values ($1, $2, 'Hello there')", [declined, taken]);
await as(amara);
await q("select public.respond_to_message_request($1, false)", [declined]);
check("declined requests leave the inbox", (await q("select 1 from public.conversation_list where id = $1", [declined])).length === 0);
await as(taken);
rows = await q("select user_id, status from public.conversation_participants where conversation_id = $1", [declined]);
check("senders cannot read the recipient's status", rows.length === 1 && rows[0].user_id === taken, rows);
row = await one("select members from public.conversation_list where id = $1", [declined]);
check("a declined request looks like one still waiting", row.members.length === 1 && row.members[0].status === "pending" && row.members[0].read_at === null, row.members);
check("an existing conversation can always be opened", (await one("select public.can_message($1) as ok", [amara])).ok === true);
check("nobody can message themselves", (await one("select public.can_message($1) as ok", [taken])).ok === false);

await as(amara);
const pic = (await one("insert into public.messages (conversation_id, sender_id, image_paths, image_alts) values ($1, $2, $3, $4) returning id", [group, amara, [`${group}/a.webp`], ["Our picnic at New Farm Park"]])).id;
check("message images carry descriptions", (await one("select image_alts from public.messages where id = $1", [pic])).image_alts[0] === "Our picnic at New Farm Park");
await fails("each image gets one description or none", "insert into public.messages (conversation_id, sender_id, image_paths, image_alts) values ($1, $2, $3, $4)", [group, amara, [`${group}/b.webp`], ["one", "two"]], /check/);
await fails("image descriptions are up to 1000 characters", "insert into public.messages (conversation_id, sender_id, image_paths, image_alts) values ($1, $2, $3, $4)", [group, amara, [`${group}/c.webp`], ["x".repeat(1001)]], /check/);
await as(mod);
await q("select public.moderate_content('message', $1, false, null, 'safety')", [pic]);
await superuser();
row = await one("select image_paths, image_alts from public.messages where id = $1", [pic]);
check("removing a message removes its image descriptions", row.image_paths.length === 0 && row.image_alts.length === 0, row);
await as(kofi);
await q("insert into public.messages (conversation_id, sender_id, body, reply_to_id) values ($1, $2, 'Count me in', $3)", [group, kofi, pic]);
await superuser();
await q("update public.profile_settings set dm_policy = 'nobody' where id = $1", [hana]);
await as(kofi);
await fails("people who turned off messages cannot be messaged", "select public.start_direct_conversation($1)", [hana], /not taking/);
check("can_message respects contact settings", (await one("select public.can_message($1) as ok", [hana])).ok === false);
await as(amara);
await q("insert into public.blocks (blocker_id, blocked_id) values ($1, $2)", [amara, taken]);
await as(taken);
check("can_message is false between blocked people", (await one("select public.can_message($1) as ok", [amara])).ok === false);
await as(amara);
await q("delete from public.blocks where blocker_id = $1", [amara]);
await anon();
await fails("guests cannot call can_message", "select public.can_message($1)", [amara], /permission denied/);

console.log("\nOrganisations");
await as(amara);
const org = (await one("select public.create_organisation('brisbane_african_assoc', 'Brisbane African Association', 'Community association', 'Community organisation', $1::smallint) as id", [brisbane])).id;
const orgPost = await post("Our AGM is next Saturday", "en", org);
row = await one("select author_id, created_by from public.posts where id = $1", [orgPost]);
check("members post as their organisation", row.author_id === org && row.created_by === amara, row);
await as(kofi);
await fails("outsiders cannot post as an organisation", "select public.create_post('fake', 'en', $1)", [org], /cannot post as/);
await q("insert into public.follows (follower_id, followee_id) values ($1, $2)", [kofi, org]);
check("following an organisation shows its posts", (await q("select id from public.feed_following()")).some((r) => r.id === orgPost));
await as(amara);
check("the team sees the organisation's notifications", (await one("select count(*)::int as n from public.notifications where recipient_id = $1", [org])).n === 1);
await q("insert into public.organisation_members (org_id, user_id, role) values ($1, $2, 'editor')", [org, kofi]);
await as(kofi);
check("editors act as the organisation", (await one("select public.can_act_as($1) as ok", [org])).ok);
await fails("editors cannot add people", "insert into public.organisation_members (org_id, user_id) values ($1, $2)", [org, hana], /row-level security/);
await as(amara);
await fails("the last owner cannot leave", "delete from public.organisation_members where org_id = $1 and user_id = $2", [org, amara], /ownership/);

console.log("\nSpaces, events and opportunities");
await as(kofi);
const space = (await one("select id from public.spaces where slug = 'brisbane'")).id;
await fails("posting in a space needs membership", "select public.create_post('hi', 'en', null, null, null, $1)", [space], /Join the space/);
await q("insert into public.space_members (space_id, user_id) values ($1, $2)", [space, kofi]);
const spacePost = await post("First post in the Brisbane space", "en", null, null, null, space);
check("space feeds list space posts", (await q("select id from public.feed_space($1)", [space]))[0]?.id === spacePost);
row = await one("select members_count, posts_count from public.spaces where id = $1", [space]);
check("space counters update", row.members_count === 1 && row.posts_count === 1, row);
const tech = (await one("select id from public.spaces where slug = 'tech'")).id;
await fails("nobody joins as an owner", "insert into public.space_members (space_id, user_id, role) values ($1, $2, 'owner')", [tech, kofi], /row-level security/);
const runners = (await one("select public.create_space('brisbane-runners', 'Brisbane Runners', 'Weekend runs', 'interest') as id")).id;
check("space creators own their space", (await one("select role from public.space_members where space_id = $1 and user_id = $2", [runners, kofi])).role === "owner");
await fails("spaces cannot take an address that is a page", "select public.create_space('joined', 'Joined', '', 'interest')", [], /spaces_slug_not_a_page/);

await as(amara);
const event = (await one(
  "insert into public.events (host_id, created_by, title, starts_at, city_id, venue_name, capacity, status) values ($1, $2, 'AfroFest Brisbane', now() + interval '7 days', $3, 'King George Square', 1, 'published') returning id, status",
  [org, amara, brisbane],
)).id;
await as(kofi);
await q("insert into public.event_rsvps (event_id, user_id, status) values ($1, $2, 'going')", [event, kofi]);
check("RSVPs count", (await one("select going_count from public.events where id = $1", [event])).going_count === 1);
await as(hana);
await fails("full events turn people away", "insert into public.event_rsvps (event_id, user_id, status) values ($1, $2, 'going')", [event, hana], /full/);
await as(amara);
check("hosts hear about new attendees", (await one("select count(*)::int as n from public.notifications where recipient_id = $1 and type = 'event_rsvp'", [org])).n === 1);
const eventPost = await post("Free entry!", "en", org, null, null, null, null, null, "[]", null, event);
check("posts can share an event", (await one("select event->>'title' as t from public.post_details where id = $1", [eventPost])).t === "AfroFest Brisbane");

const opp = (await one(
  "insert into public.opportunities (poster_id, created_by, type, title, description, city_id, apply_url) values ($1, $1, 'scholarship', 'STEM scholarship', 'For African Australian students in STEM', $2, 'https://example.org/apply') returning id",
  [amara, brisbane],
)).id;
await as(kofi);
await fails("nobody lists opportunities as someone else", "insert into public.opportunities (poster_id, created_by, type, title, description, apply_url) values ($1, $2, 'job', 'Fake job', 'Not a real job at all', 'https://x.y')", [amara, kofi], /row-level security/);
await q("insert into public.saved_opportunities (user_id, opportunity_id) values ($1, $2)", [kofi, opp]);
check("people save opportunities", (await one("select count(*)::int as n from public.saved_opportunities")).n === 1);
await superuser();
await q("update public.site_settings set premoderation = true");
const newbie = await createUser("new@example.com", { username: "newbie" });
await as(newbie);
const scamJob = (await one("insert into public.opportunities (poster_id, created_by, type, title, description, apply_url, status) values ($1, $1, 'job', 'Easy money', 'Send a deposit to get started', 'https://scam.example', 'published') returning id", [newbie])).id;
check("new members' listings wait for review, whatever they ask for", (await one("select status from public.opportunities where id = $1", [scamJob])).status === "pending");
await superuser();
await q("update public.site_settings set premoderation = false");

console.log("\nReports and moderation");
const spam = await createUser("spam@example.com", { username: "spammer" });
await as(spam);
const spamPost = await post("Buy followers now!!!");
for (const reporter of [amara, kofi, hana]) {
  await as(reporter);
  await q("select public.report_content('post', $1, 'spam')", [spamPost]);
}
await as(hana);
await fails("people report something once", "select public.report_content('post', $1, 'scam')", [spamPost]);
check("posts are held after several reports", (await one("select count(*)::int as n from public.posts where id = $1", [spamPost])).n === 0);
await as(spam);
check("authors still see their held post", (await one("select status from public.posts where id = $1", [spamPost])).status === "pending");
const spamNext = await post("More spam");
check("reported members' new posts wait for review", (await one("select status from public.posts where id = $1", [spamNext])).status === "pending");
await as(kofi);
check("only moderators see the queues", (await q("select * from public.report_queue")).length === 0 && (await q("select id from public.reports")).length === 0);
await fails("members cannot moderate", "select public.moderate_content('post', $1, false)", [spamPost], /Moderators only/);
await as(mod);
rows = await q("select report_count, snapshot, reports from public.report_queue where target_id = $1", [spamPost]);
check("moderators see grouped reports with a copy, not who reported", rows[0]?.report_count === 3 && rows[0].snapshot.includes("Buy followers") && !JSON.stringify(rows[0].reports).includes(amara), rows);
await q("select public.moderate_content('post', $1, false, 'Spam', 'honesty')", [spamPost]);
await q("select public.moderate_suspend($1, 7, 'Spam account', 'honesty')", [spam]);
check("actioned reports leave the queue", (await q("select * from public.report_queue where target_id = $1", [spamPost])).length === 0);
await as(spam);
await fails("suspended people cannot post", "select public.create_post('again')", [], /cannot post/);
rows = await q("select message from public.notifications where recipient_id = $1 and type = 'moderation'", [spam]);
check("authors are told why, without naming the moderator", rows.length === 2 && rows[0].message.includes("Spam"), rows);

await as(hana);
const dm = (await one("select id from public.messages where conversation_id = $1 and sender_id = $2", [conv, amara])).id;
await q("select public.report_content('message', $1, 'harassment', 'Test')", [dm]);
await as(mod);
check("message reports keep a copy for moderators", (await one("select snapshot from public.report_queue where target_type = 'message'"))?.snapshot === "Hello Hana");

console.log("\nDeleting and undo");
await as(amara);
await q("select public.delete_post($1)", [post1]);
row = await one("select body, deleted_at is not null as deleted from public.posts where id = $1", [post1]);
check("deleted posts are blanked at once", row.body === "" && row.deleted, row);
rows = await q("select id from public.feed_latest()");
check("deleted posts leave feeds", !rows.some((r) => r.id === post1));
await q("select public.restore_post($1)", [post1]);
row = await one("select body, deleted_at, quote_count from public.posts where id = $1", [post1]);
check("undo restores the post within 30 seconds", row.body.startsWith("Who's coming") && row.deleted_at === null, row);
await superuser();
check("undo does not notify again", (await one("select count(*)::int as n from public.notifications where post_id = $1 and type = 'mention'", [post1])).n === 1);
await as(amara);
await q("select public.delete_post($1)", [post1]);
await superuser();
await q("update public.deleted_post_contents set deleted_at = now() - interval '1 minute'");
await q("select public.purge_deleted_posts()");
await as(amara);
await fails("undo expires", "select public.restore_post($1)", [post1], /too late/);
row = await one("select author_id, body from public.posts where id = $1", [post1]);
check("purged posts keep only a tombstone", row.author_id === null && row.body === "", row);
check("replies to deleted posts keep their thread", (await one("select parent_id from public.posts where id = $1", [reply1])).parent_id === post1);
rows = await q("select id, author from public.post_ancestors($1)", [reply1]);
check("tombstones show no author", rows[0]?.author === null, rows);
await as(kofi);
await fails("people cannot delete others' posts", "select public.delete_post($1)", [imgPost], /cannot delete/);
await as(amara);
await q("select public.delete_post($1)", [imgPost]);
await superuser();
await q("update public.deleted_post_contents set deleted_at = now() - interval '1 minute'");
await q("select public.purge_deleted_posts()");
check("erased images are queued for storage removal", (await one("select count(*)::int as n from public.storage_cleanup")).n === 1);

console.log("\nExport and account deletion");
await as(kofi);
row = await one("select public.export_my_data() as data");
check("the export has posts, likes and messages", row.data.posts.length >= 2 && Array.isArray(row.data.likes) && row.data.following.length >= 1 && "messages_sent" in row.data, Object.keys(row.data));
check("the export leaves out the internal role", !("site_role" in row.data.settings));
check("the export has the account's email and sign-in methods", row.data.account.email === "kofi@example.com" && Array.isArray(row.data.account.providers) && "last_sign_in_at" in row.data.account, row.data.account);
check("the export lists conversations with their settings", row.data.conversations.some((c) => c.conversation_id === group && c.status === "accepted" && "muted" in c && "last_read_at" in c), row.data.conversations);
const sentMessage = row.data.messages_sent.find((m) => m.body === "Count me in");
check("sent messages include images and replies", sentMessage && Array.isArray(sentMessage.image_paths) && sentMessage.reply_to_id === pic, row.data.messages_sent);
check("notifications name who did what", row.data.notifications.some((n) => n.type === "follow" && n.actor === "amara" && "post_id" in n), row.data.notifications);
await q("select public.delete_my_account()");
await superuser();
check("account deletion removes the profile", (await one("select count(*)::int as n from public.profiles where id = $1", [kofi])).n === 0);
row = await one("select author_id, body from public.posts where id = $1", [reply1]);
check("their posts are erased but threads survive", row.author_id === null && row.body === "", row);
check("their settings are gone", (await one("select count(*)::int as n from public.profile_settings where id = $1", [kofi])).n === 0);

console.log("\nAPI surface");
const member = await createUser("api@example.com", { username: "api_member" });
await as(member);
for (const [name, sql] of [
  ["publish_post", "select public.publish_post(gen_random_uuid())"],
  ["notify", "select public.notify(gen_random_uuid(), gen_random_uuid(), 'follow')"],
  ["is_blocked_between", "select public.is_blocked_between(gen_random_uuid(), gen_random_uuid())"],
  ["has_good_reputation", "select public.has_good_reputation(gen_random_uuid())"],
  ["purge_deleted_posts", "select public.purge_deleted_posts()"],
  ["erase_post", "select public.erase_post(gen_random_uuid())"],
]) {
  await fails(`members cannot call ${name}`, sql, [], /permission denied/);
}
await fails("members cannot read the undo store", "select * from public.deleted_post_contents", [], /permission denied/);
await fails("members cannot read the storage cleanup queue", "select * from public.storage_cleanup", [], /permission denied/);
await fails("members cannot update columns they don't own", "update public.profiles set followers_count = 1000 where id = $1", [member], /permission denied/);
check("members can still post", (await one("select public.create_post('Hello from the API') as id")).id !== null);
check("members can still follow", (await q("insert into public.follows (follower_id, followee_id) values ($1, $2) returning 1", [member, amara])).length === 1);
await anon();
await fails("guests cannot post", "select public.create_post('hi')", [], /permission denied/);
check("guests read no one's settings", (await q("select * from public.profile_settings")).length === 0);
check("guests read no votes or saves", (await q("select 1 from public.poll_votes union all select 1 from public.saves")).length === 0);
check("guests can read public feeds", (await q("select id from public.feed_latest()")).length > 0);

console.log("\nBlocks in people lists");
{
  const one = await createUser("blocklist1@example.com", { username: "blocklist_one" });
  const two = await createUser("blocklist2@example.com", { username: "blocklist_two" });
  const three = await createUser("blocklist3@example.com", { username: "blocklist_three" });
  await as(two);
  await q("insert into public.blocks (blocker_id, blocked_id) values ($1, $2)", [two, one]);
  await as(one);
  await q("insert into public.blocks (blocker_id, blocked_id) values ($1, $2)", [one, three]);
  const rows = await q("select * from public.blocked_with_viewer($1::uuid[]) as id", [`{${two},${three},${amara}}`]);
  check("lists can leave out people on either side of a block", rows.length === 2 && rows.some((r) => r.id === two) && rows.some((r) => r.id === three), rows);
  await anon();
  await fails("guests cannot ask who is blocked", "select * from public.blocked_with_viewer($1::uuid[])", [`{${two}}`], /permission denied/);
}

console.log("\nActivity and metrics");
{
  await as(amara);
  await q("select public.mark_seen()");
  await q("select public.mark_seen()");
  await as(hana);
  await q("select public.mark_seen()");
  await superuser();
  let row = await one("select members from public.active_member_counts where day = public.sydney_today()");
  check("each member counts once a day however often they are seen", row.members === 2, row);
  await as(amara);
  await fails("members cannot read who was active", "select * from public.member_activity", [], /permission denied/);
  await fails("members cannot see metrics", "select public.admin_metrics()", [], /Only admins/);
  await fails("members cannot see service health", "select public.admin_health()", [], /Only admins/);
  row = (await one("select public.export_my_data() as data")).data;
  check("a member's export includes the last day they were seen", typeof row.activity?.last_seen === "string", row.activity);
  await anon();
  await fails("guests cannot record activity", "select public.mark_seen()", [], /permission denied/);
  const lead = await createUser("lead@example.com", { username: "site_lead" });
  await superuser();
  await q("update public.profile_settings set site_role = 'admin' where id = $1", [lead]);
  await as(lead);
  const metrics = (await one("select public.admin_metrics() as m")).m;
  check(
    "admins see the funnel",
    metrics.active.day === 2 && metrics.daily.length === 30 && metrics.current.retention.length === 3 && metrics.signups.total > 5 && typeof metrics.current.answered.posts === "number",
    { active: metrics.active, signups: metrics.signups },
  );
  const health = (await one("select public.admin_health() as h")).h;
  check("admins see service health", typeof health.openReports === "number" && typeof health.lastDay.posts === "number", health);
}

console.log("\nSecurity hardening");
{
  const owner = await createUser("org_owner@example.com", { username: "org_owner" });
  const editor = await createUser("org_editor@example.com", { username: "org_editor" });
  await as(owner);
  const team = (await one("select public.create_organisation('hardening_org', 'Hardening Org') as id")).id;
  await q("insert into public.organisation_members (org_id, user_id, role) values ($1, $2, 'editor')", [team, editor]);
  await as(editor);
  await q("update public.profiles set bio = 'edited by an editor' where id = $1", [team]);
  await q("update public.profile_settings set discoverable = false where id = $1", [team]);
  await superuser();
  let row = await one("select p.bio, s.discoverable from public.profiles p join public.profile_settings s on s.id = p.id where p.id = $1", [team]);
  check("editors cannot edit the organisation's profile or settings", row.bio === "" && row.discoverable === true, row);
  await as(editor);
  check("editors still post as the organisation", (await one("select author_id from public.posts where id = $1", [await post("Posted by an editor", "en", team)])).author_id === team);
  await as(owner);
  await q("update public.profiles set bio = 'edited by the owner' where id = $1", [team]);
  check("owners edit the organisation's profile", (await one("select bio from public.profiles where id = $1", [team])).bio === "edited by the owner");

  const blocker = await createUser("blocker@example.com", { username: "the_blocker" });
  const blocked = await createUser("blocked@example.com", { username: "the_blocked" });
  await as(blocked);
  const front = (await one("select public.create_organisation('front_org', 'Front Org') as id")).id;
  await superuser();
  await q("update public.site_settings set premoderation = true");
  await as(blocked);
  const held = await post("Hello @the_blocker", "en", front);
  await superuser();
  await q("update public.site_settings set premoderation = false");
  await as(blocker);
  await q("insert into public.blocks (blocker_id, blocked_id) values ($1, $2)", [blocker, blocked]);
  await as(mod);
  await q("select public.moderate_content('post', $1, true)", [held]);
  await as(blocked);
  const fresh = await post("Hello again @the_blocker", "en", front);
  check("mentions skip people who blocked the writer of an organisation's post", (await one("select mentions from public.posts where id = $1", [fresh])).mentions.length === 0);
  await as(blocker);
  check("blocked writers' organisation posts don't notify", (await one("select count(*)::int as n from public.notifications where recipient_id = $1", [blocker])).n === 0);
  check("blocked writers' organisation posts are hidden", (await q("select id from public.post_details where id = any($1)", [[held, fresh]])).length === 0);
  check("blocked writers' organisation posts leave feeds", !(await q("select id from public.feed_latest()")).some((r) => r.id === held || r.id === fresh));

  const strangers = [];
  for (let i = 0; i < 21; i++) strangers.push(await createUser(`stranger${i}@example.com`, { username: `stranger_${i}` }));
  const inviter = await createUser("inviter@example.com", { username: "group_inviter" });
  await as(inviter);
  const crowd = (await one("select public.create_group_conversation('Crowd', $1::uuid[]) as id", [`{${strangers.slice(0, 20).join(",")}}`])).id;
  await fails("group invites count towards the daily request limit", "select public.add_group_members($1, $2::uuid[])", [crowd, `{${strangers[20]}}`], /message requests today/);
  await fails("direct requests share the limit with group invites", "select public.start_direct_conversation($1)", [strangers[20]], /message requests today/);
  const spammer = await createUser("group_spam@example.com", { username: "group_spammer" });
  await as(spammer);
  await fails("a group cannot invite more strangers than the daily limit", "select public.create_group_conversation('Spam', $1::uuid[])", [`{${strangers.join(",")}}`], /message requests today/);

  const pollster = await createUser("pollster@example.com", { username: "pollster" });
  const voter = await createUser("voter@example.com", { username: "poll_voter" });
  await as(pollster);
  const vote = await post("Jollof or fufu?", "en", null, null, null, null, null, null, "[]", JSON.stringify({ options: ["Jollof", "Fufu"], duration_hours: 24 }));
  await as(voter);
  await fails("option counts are not readable before voting", "select votes_count from public.poll_options where post_id = $1", [vote], /permission denied/);
  await anon();
  await fails("guests cannot read option counts", "select votes_count from public.poll_options where post_id = $1", [vote], /permission denied/);
  await as(voter);
  const choices = await q("select id from public.poll_options where post_id = $1 order by position", [vote]);
  await q("select public.vote_poll($1, $2)", [vote, choices[0].id]);
  row = await one("select poll from public.post_details where id = $1", [vote]);
  check("voters still see the counts in post details", row.poll.options[0].votes_count === 1 && row.poll.votes_count === 1, row.poll);

  await as(mod);
  await fails("moderators cannot read who reported", "select reporter_id from public.reports", [], /permission denied/);
  check("moderators still read reports", (await q("select id, reason from public.reports")).length > 0);

  await as(pollster);
  await fails("link cards need the link in the post", "select public.create_post('No link here', 'en', null, null, null, null, 'https://evil.example')", [], /link in the post/);
  check("link cards take a link from the post", (await one("select link_url from public.posts where id = $1", [await post("Read https://example.org/a", "en", null, null, null, null, "https://example.org/a")])).link_url === "https://example.org/a");
  check("www links count as in the post", (await post("See www.example.org", "en", null, null, null, null, "https://www.example.org")) !== null);
  await fails("images point at their upload", "select public.create_post('pic', 'en', null, null, null, null, null, null, $1::jsonb)",
    [JSON.stringify([{ path: `${pollster}/posts/a.webp`, url: "https://evil.example/a.webp" }])], /Invalid image/);
  await fails("image paths stay in the uploader's folder", "select public.create_post('pic', 'en', null, null, null, null, null, null, $1::jsonb)",
    [JSON.stringify([{ path: `${pollster}/../${voter}/posts/a.webp`, url: `${MEDIA}${pollster}/../${voter}/posts/a.webp` }])], /Invalid image/);

  await fails("profile links are web addresses", "update public.profiles set links = $2::jsonb where id = $1", [pollster, JSON.stringify([{ label: "x", url: "javascript:alert(1)" }])], /profiles_links_are_web/);
  await q("update public.profiles set links = $2::jsonb where id = $1", [pollster, JSON.stringify([{ label: "Site", url: "https://example.org" }])]);
  check("web links are saved", (await one("select links from public.profiles where id = $1", [pollster])).links.length === 1);
}

console.log("\nWho to follow and followers you know");
{
  const viewer = await createUser("wtf_viewer@example.com", { username: "wtf_viewer" });
  const friendA = await createUser("wtf_a@example.com", { username: "wtf_friend_a" });
  const friendB = await createUser("wtf_b@example.com", { username: "wtf_friend_b" });
  const known = await createUser("wtf_known@example.com", { username: "wtf_known" });
  const muted = await createUser("wtf_muted@example.com", { username: "wtf_muted" });
  const follow = async (follower, followee) => {
    await as(follower);
    await q("insert into public.follows (follower_id, followee_id) values ($1, $2)", [follower, followee]);
  };
  await follow(viewer, friendA);
  await follow(viewer, friendB);
  await follow(friendA, known);
  await follow(friendB, known);
  await follow(friendA, muted);
  await follow(viewer, muted);
  await follow(muted, known);
  await as(viewer);
  await q("insert into public.mutes (muter_id, muted_id) values ($1, $2)", [viewer, muted]);

  const pool = await q("select username, reason, source from public.suggestion_pool()");
  const knownRow = pool.find((r) => r.username === "wtf_known");
  check("the network pool has people your follows follow", knownRow?.source === "network" && knownRow.reason === "Followed by 2 people you follow", knownRow);
  check("the rest of the pool is popular people", pool.some((r) => r.source === "popular") && pool.filter((r) => r.source === "popular").length <= 20, pool.length);
  check("suggestions leave out yourself, people you follow and muted people",
    !pool.some((r) => ["wtf_viewer", "wtf_friend_a", "wtf_friend_b", "wtf_muted"].includes(r.username)), pool.map((r) => r.username));

  rows = await q("select username, total from public.followers_you_know($1, 1)", [known]);
  check("followers you know are counted beyond the names shown", rows.length === 1 && Number(rows[0].total) === 2, rows);
  rows = await q("select username from public.followers_you_know($1)", [known]);
  check("followers you know leave out muted people", rows.length === 2 && !rows.some((r) => r.username === "wtf_muted"), rows);
  await as(known);
  check("nobody is shown as a follower you know of yourself", (await q("select * from public.followers_you_know($1)", [known])).length === 0);
  await anon();
  await fails("guests get no suggestions", "select * from public.suggestion_pool()", [], /permission denied/);
  await fails("guests get no followers you know", "select * from public.followers_you_know($1)", [known], /permission denied/);
}

console.log("\nScheduled posts");
{
  const writer = await createUser("scheduler@example.com", { username: "the_scheduler" });
  const other = await createUser("scheduler_other@example.com", { username: "other_scheduler" });
  const inAnHour = new Date(Date.now() + 3_600_000).toISOString();
  const schedule = async (body, extra = {}) => {
    const args = { p_scheduled_at: inAnHour, p_body: body, ...extra };
    const names = Object.keys(args);
    return (await one(`select public.schedule_post(${names.map((name, i) => `${name} => $${i + 1}`).join(", ")}) as id`, Object.values(args))).id;
  };
  const publishDue = async () => {
    await superuser();
    await q("update public.scheduled_posts set scheduled_at = now() - interval '1 minute' where submitted_at is null");
    return (await one("select public.publish_scheduled_posts() as n")).n;
  };
  const image = (owner, name) => ({ path: `${owner}/posts/${name}.webp`, url: `${MEDIA}${owner}/posts/${name}.webp`, width: 10, height: 10, alt: "" });

  await as(writer);
  const queued = await schedule("Scheduled hello @other_scheduler");
  check("scheduling does not post", (await one("select count(*)::int as n from public.posts where created_by = $1", [writer])).n === 0);
  check("the member sees their scheduled post", (await q("select id from public.scheduled_posts")).length === 1);
  await as(other);
  check("scheduled posts are private", (await q("select id from public.scheduled_posts where id = $1", [queued])).length === 0);
  await q("delete from public.scheduled_posts where id = $1", [queued]);
  await anon();
  await fails("guests cannot schedule", "select public.schedule_post(now() + interval '1 hour', 'hi')", [], /permission denied/);
  await as(writer);
  check("nobody cancels someone else's scheduled post", (await q("select id from public.scheduled_posts where id = $1", [queued])).length === 1);
  await fails("scheduled posts are only written through schedule_post", "insert into public.scheduled_posts (created_by, author_id, body, scheduled_at) values ($1, $1, 'x', now())", [writer], /permission denied/);
  await fails("scheduled posts cannot be edited", "update public.scheduled_posts set body = 'edited' where id = $1", [queued], /permission denied/);
  await fails("members cannot run the publisher", "select public.publish_scheduled_posts()", [], /permission denied/);
  await fails("a scheduled time is in the future", "select public.schedule_post(now() - interval '1 minute', 'late')", [], /in the future/);
  await fails("a scheduled time is at most 30 days ahead", "select public.schedule_post(now() + interval '31 days', 'far')", [], /30 days/);
  await fails("scheduled images come from the member's own uploads", "select public.schedule_post(now() + interval '1 hour', 'pic', p_images => $1::jsonb)", [JSON.stringify([image(other, "theirs")])], /Invalid image/);
  await fails("members cannot schedule as an organisation they don't run", "select public.schedule_post(now() + interval '1 hour', 'hi', p_author_id => $1)", [other], /cannot post as/);
  for (let i = 0; i < 9; i++) await schedule(`Queued ${i}`);
  await fails("a member has at most 10 scheduled posts", "select public.schedule_post(now() + interval '1 hour', 'eleventh')", [], /up to 10 scheduled posts/);

  await q("delete from public.scheduled_posts where body = 'Queued 0'");
  const withImage = await schedule("A photo for later", { p_images: JSON.stringify([image(writer, "later")]) });
  check("cancelling makes room for another", withImage !== null);
  await q("delete from public.scheduled_posts where id = $1", [withImage]);
  check("members cancel their scheduled posts", (await q("select id from public.scheduled_posts where id = $1", [withImage])).length === 0);
  await superuser();
  check("cancelling queues the images for removal", (await q("select path from public.storage_cleanup where path = $1", [`${writer}/posts/later.webp`])).length === 1);
  await as(writer);
  await q("delete from public.scheduled_posts where id <> $1", [queued]);

  await as(writer);
  const org = (await one("select public.create_organisation('scheduling_org', 'Scheduling Org') as id")).id;
  const asOrg = await schedule("From the organisation", { p_author_id: org, p_poll: JSON.stringify({ options: ["Yes", "No"], duration_hours: 24 }) });
  const pictured = await schedule("With a photo", { p_images: JSON.stringify([image(writer, "pictured")]) });
  const linked = await schedule("Read https://example.org/scheduled", { p_link_url: "https://example.org/scheduled", p_link_preview: JSON.stringify({ url: "https://example.org/scheduled", title: "Scheduled" }) });
  await as(other);
  await q("insert into public.blocks (blocker_id, blocked_id) values ($1, $2)", [other, writer]);
  await superuser();
  await q("update public.site_settings set premoderation = true");
  check("the publisher posts every due post", (await publishDue()) === 4);
  await q("update public.site_settings set premoderation = false");
  check("the publisher leaves no one signed in", (await one("select auth.uid() as id")).id === null);
  const outcome = async (id) => one("select s.*, p.author_id as post_author, p.created_by as post_writer, p.status, p.mentions, p.link_url as post_link, p.link_preview as post_preview from public.scheduled_posts s left join public.posts p on p.id = s.post_id where s.id = $1", [id]);
  row = await outcome(queued);
  check("a scheduled post is written by the member who scheduled it", row.post_writer === writer && row.post_author === writer, row);
  check("a published scheduled post keeps only its outcome", row.body === "" && row.submitted_at !== null && row.error === null, row);
  check("scheduled posts go through review", row.status === "pending", row.status);
  check("mentions are checked against blocks when the post goes out", row.mentions.length === 0, row.mentions);
  row = await outcome(asOrg);
  check("scheduled posts can appear under an organisation", row.post_author === org && row.post_writer === writer, row);
  check("scheduled polls are posted", (await one("select count(*)::int as n from public.poll_options where post_id = $1", [row.post_id])).n === 2);
  row = await outcome(pictured);
  check("scheduled images are posted", (await one("select storage_path from public.post_images where post_id = $1", [row.post_id])).storage_path === `${writer}/posts/pictured.webp`);
  row = await outcome(linked);
  check("scheduled link cards are posted", row.post_link === "https://example.org/scheduled" && row.post_preview?.title === "Scheduled", row);

  await as(writer);
  await q("delete from public.scheduled_posts where id = $1", [queued]);
  check("a post already handed over cannot be cancelled", (await q("select id from public.scheduled_posts where id = $1", [queued])).length === 1);

  const editor = await createUser("scheduling_editor@example.com", { username: "scheduling_editor" });
  await as(writer);
  await q("insert into public.organisation_members (org_id, user_id, role) values ($1, $2, 'editor')", [org, editor]);
  await as(editor);
  const leftOrg = await schedule("Before I leave", { p_author_id: org });
  await as(writer);
  await q("delete from public.organisation_members where org_id = $1 and user_id = $2", [org, editor]);
  const suspended = await schedule("Before the suspension", { p_images: JSON.stringify([image(writer, "suspended")]) });
  await as(mod);
  await q("select public.moderate_suspend($1, 7, 'Testing', 'respect')", [writer]);
  check("nothing is posted for a suspended member or a former editor", (await publishDue()) === 0);
  row = await outcome(suspended);
  check("suspension is checked when the post goes out", row.post_id === null && /cannot post/.test(row.error) && row.error_code === "42501", row);
  check("a failed scheduled post keeps its text", row.body === "Before the suspension" && row.images.length === 0, row);
  check("a failed scheduled post's images are queued for removal", (await q("select path from public.storage_cleanup where path = $1", [`${writer}/posts/suspended.webp`])).length === 1);
  check("organisation membership is checked when the post goes out", /cannot post as/.test((await outcome(leftOrg)).error));
  await as(writer);
  await q("delete from public.scheduled_posts where id = $1", [suspended]);
  check("members clear a scheduled post that failed", (await q("select id from public.scheduled_posts where id = $1", [suspended])).length === 0);
  check("scheduled posts are in the export", (await one("select public.export_my_data() as data")).data.scheduled_posts.length === 4);

  await superuser();
  await q("update public.scheduled_posts set submitted_at = now() - interval '31 days' where id = $1", [queued]);
  await q("select public.publish_scheduled_posts()");
  check("outcomes are erased after 30 days", (await q("select id from public.scheduled_posts where id = $1", [queued])).length === 0);
}

console.log("\nAge assurance");
{
  const sixteenToday = "((now() at time zone 'Australia/Sydney')::date - interval '16 years')::date";
  await anon();
  row = await one(`select public.meets_minimum_age(${sixteenToday}) as today, public.meets_minimum_age((${sixteenToday} + 1)) as tomorrow`);
  check("someone is old enough on their 16th birthday, not the day before", row.today === true && row.tomorrow === false, row);

  await superuser();
  check("a sign-up that confirmed its age records only when", (await one("select age_confirmed_at is not null as ok from public.profile_settings where id = $1", [amara])).ok);
  const adult = await createUser("adult@example.com", { username: "adult_member", age_confirmed: false });
  const young = await createUser("young@example.com", { username: "young_member", age_confirmed: false });
  const teen = await createUser("teen@example.com", { username: "teen_member" });
  await as(adult);
  check("members start unconfirmed when they joined another way", (await one("select age_confirmed_at from public.profile_settings where id = $1", [adult])).age_confirmed_at === null);
  await fails("members cannot post until their age is confirmed", "select public.create_post('hello')", [], /cannot post/);
  await fails("members cannot mark their own age as confirmed", "update public.profile_settings set age_confirmed_at = now() where id = $1", [adult], /permission denied/);
  await fails("a date of birth in the future is refused", "select public.confirm_age((now() + interval '2 days')::date)", [], /date of birth/);
  check("16 or older confirms the account", (await one("select public.confirm_age('1990-05-01') as ok")).ok === true);
  check("confirmed members can post", (await one("select public.create_post('Hello, I am new') as id")).id !== null);
  const settings = (await one("select public.export_my_data() as data")).data.settings;
  check("the export has when the age was confirmed, never a date of birth", settings.age_confirmed_at !== null && !JSON.stringify(settings).includes("1990"), settings);

  await as(young);
  check("under 16 deactivates the account", (await one(`select public.confirm_age((${sixteenToday} + 1)) as ok`)).ok === false);
  check("a deactivated account is recorded", (await one("select age_deactivated_at is not null as off, age_confirmed_at from public.profile_settings where id = $1", [young])).off);
  await fails("a deactivated member cannot try again", "select public.confirm_age('1990-05-01')", [], /deactivated/);
  await fails("a deactivated member cannot post", "select public.create_post('hello')", [], /cannot post/);
  check("members cannot read the record of age checks", (await q("select * from public.age_checks")).length === 0);

  await as(teen);
  const teenPost = await post("First day at my new school");
  await as(amara);
  await q("select public.report_content('profile', $1, 'under_16', 'Says they are in year 9')", [teen]);
  await fails("members cannot deactivate accounts", "select public.moderate_deactivate_under_16($1, 'report')", [teen], /Moderators only/);
  await as(mod);
  await fails("deactivating needs a reason for suspicion", "select public.moderate_deactivate_under_16($1, 'document')", [teen], /under 16/);
  await q("select public.moderate_deactivate_under_16($1, 'report')", [teen]);
  rows = await q("select step, basis, moderator_id from public.age_checks order by id");
  check(
    "the record shows each step and who took it",
    rows.length === 2 && rows[0].step === "declared_under_16" && rows[0].basis === "self_declared" && rows[0].moderator_id === null && rows[1].step === "flagged" && rows[1].moderator_id === mod,
    rows,
  );
  check("the reports about them are closed", (await q("select 1 from public.report_queue where target_id = $1", [teen])).length === 0);
  check("deactivating is logged under the age rule", (await one("select rule from public.moderation_actions where target_id = $1 and action = 'deactivate'", [teen])).rule === "age");
  await as(teen);
  row = await one("select message, rule, moderation_action_id from public.notifications where recipient_id = $1 and type = 'moderation'", [teen]);
  check("they get a notice saying why and what happens next", row.message.startsWith("Your account is deactivated because we believe you're under 16.") && row.rule === "age" && row.moderation_action_id !== null, row);
  await as(young);
  row = await one("select message from public.notifications where recipient_id = $1 and type = 'moderation'", [young]);
  check("someone who said they're under 16 is told so", row.message.startsWith("Your account is deactivated because you told us you're under 16."), row);
  await anon();
  check("a deactivated person's posts are hidden", (await q("select id from public.posts where id = $1", [teenPost])).length === 0);
  check("and no longer counted", (await one("select posts_count from public.profiles where id = $1", [teen])).posts_count === 0);

  await as(mod);
  await fails("reinstating needs how they showed their age", "select public.moderate_reinstate_age($1, 'report')", [teen], /16 or older/);
  await q("select public.moderate_reinstate_age($1, 'video_call')", [teen]);
  await anon();
  check("reinstating brings their posts back", (await q("select id from public.posts where id = $1", [teenPost])).length === 1);
  await as(teen);
  check("a reinstated member is told and can post again", (await q("select 1 from public.notifications where recipient_id = $1 and message like 'Your account is active again%'", [teen])).length === 1 && (await post("Back again")) !== null);

  await as(mod);
  await q("select public.moderate_deactivate_under_16($1, 'posts')", [teen]);
  await superuser();
  check("accounts are kept for 30 days for a review", (await one("select public.purge_deactivated_accounts() as n")).n === 0);
  await q("update public.profile_settings set age_deactivated_at = now() - interval '31 days' where id in ($1, $2)", [teen, young]);
  await q("insert into storage.objects (bucket_id, name) values ('media', $1)", [`${teen}/avatars/a.webp`]);
  check("then they are deleted", (await one("select public.purge_deactivated_accounts() as n")).n === 2);
  check("with their profile", (await q("select 1 from public.profiles where id in ($1, $2)", [teen, young])).length === 0);
  check("and their files are queued for removal", (await q("select 1 from public.storage_cleanup where path = $1", [`${teen}/avatars/a.webp`])).length === 1);
  rows = await q("select step, profile_id from public.age_checks order by id");
  check("the record keeps the steps without the person", rows.filter((r) => r.step === "deleted").length === 2 && rows.every((r) => r.profile_id === null), rows);

  await as(adult);
  for (const [name, sql] of [
    ["deactivate_for_age", "select public.deactivate_for_age(gen_random_uuid(), 'flagged', 'report')"],
    ["purge_deactivated_accounts", "select public.purge_deactivated_accounts()"],
    ["notify_moderation", "select public.notify_moderation(gen_random_uuid(), null, 'x', null, null)"],
    ["record_moderation", "select public.record_moderation('x', 'post', gen_random_uuid(), null, null)"],
  ]) {
    await fails(`members cannot call ${name}`, sql, [], /permission denied/);
  }
}

console.log("\nModeration notices");
{
  const author = await createUser("notice@example.com", { username: "notice_author" });
  await as(author);
  const removed = await post("Pay $200 to apply for this job");
  await as(mod);
  await fails("removing something needs the rule it breaks", "select public.moderate_content('post', $1, false, 'Scam')", [removed], /rule/);
  await fails("suspending needs the rule too", "select public.moderate_suspend($1, 7, 'Scam')", [author], /rule/);
  await q("select public.moderate_content('post', $1, false, 'Asks for money to apply', 'honesty')", [removed]);
  await q("select public.moderate_suspend($1, 1, null, 'honesty')", [author]);
  await as(author);
  rows = await q("select message, rule, moderation_action_id from public.notification_details where recipient_id = $1 and type = 'moderation' order by id", [author]);
  check(
    "notices name the rule and the reason",
    rows.length === 2 && rows[0].message === "Your post was removed under rule 3 of the community rules (Be honest). Reason: Asks for money to apply" && rows[0].rule === "honesty",
    rows,
  );
  check("suspension notices say for how long and under which rule", rows[1].message === "Your account is suspended for 1 day under rule 3 of the community rules (Be honest).", rows[1]);
  check("each notice points at the decision for an appeal", rows.every((r) => r.moderation_action_id !== null));
  await as(mod);
  row = await one("select rule, reason from public.moderation_actions where id = $1", [rows[0].moderation_action_id]);
  check("moderators see the decision an appeal is about", row.rule === "honesty" && row.reason === "Asks for money to apply", row);
}

console.log("\nReporting");
{
  const poster = await createUser("reported@example.com", { username: "reported_member" });
  await as(poster);
  const claim = await post("Everyone knows Amara stole from the association");
  const image = await post("Look at this photo");
  await as(hana);
  await fails("a legal complaint needs contact details", "select public.report_content('post', $1, 'legal', 'This is defamatory')", [claim], /contact/);
  await fails("and an explanation", "select public.report_content('post', $1, 'legal', '', 'amara@example.com')", [claim], /Explain/);
  await q("select public.report_content('post', $1, 'legal', 'This is false and defamatory', 'hana@example.com')", [claim]);
  await q("select public.report_content('post', $1, 'intimate_images', null, 'hana@example.com')", [image]);
  check("reporters cannot read contact details back", (await q("select contact from public.reports")).length === 0);
  await as(mod);
  row = await one("select respond_by, first_reported_at, reports from public.report_queue where target_id = $1", [claim]);
  check("legal complaints are due within 7 days", new Date(row.respond_by) - new Date(row.first_reported_at) === 7 * 86_400_000, row);
  check("moderators see how to contact the complainant", row.reports[0].contact === "hana@example.com", row.reports);
  row = await one("select respond_by, reports from public.report_queue where target_id = $1", [image]);
  check("other reports have no deadline and keep no contact details", row.respond_by === null && row.reports[0].contact === null && row.reports[0].reason === "intimate_images", row);
}

console.log("\nPhotos re-encoded on the server");
{
  await superuser();
  rows = await q("select allowed_mime_types from storage.buckets where id in ('media', 'message-media')");
  check("both buckets take only WebP", rows.length === 2 && rows.every((r) => r.allowed_mime_types.join() === "image/webp"), rows);
  await as(amara);
  await fails("members cannot upload to media directly", "insert into storage.objects (bucket_id, name) values ('media', $1)", [`${amara}/posts/raw.webp`], /row-level security/);
  await fails("or to message attachments", "insert into storage.objects (bucket_id, name) values ('message-media', $1)", [`${conv}/raw.webp`], /row-level security/);
  check("members may upload to their own folder through the server", (await one("select public.can_upload('media', $1) as ok", [amara])).ok === true);
  check("but not to someone else's", (await one("select public.can_upload('media', $1) as ok", [kofi])).ok === false);
  check("and to conversations they are in", (await one("select public.can_upload('message-media', $1) as ok", [conv])).ok === true);
  check("no other bucket", (await one("select public.can_upload('avatars', $1) as ok", [amara])).ok === false);
  await as(kofi);
  check("but not conversations they aren't in", (await one("select public.can_upload('message-media', $1) as ok", [conv])).ok === false);
  await anon();
  await fails("guests cannot ask", "select public.can_upload('media', $1)", [amara], /permission denied/);
  await as(amara);
  await fails("post images must be the server's WebP", "select public.create_post('pic', 'en', null, null, null, null, null, null, $1::jsonb)",
    [JSON.stringify([{ path: `${amara}/posts/a.jpg`, url: `${MEDIA}${amara}/posts/a.jpg` }])], /Invalid image/);
  await fails("message images must be the server's WebP", "insert into public.messages (conversation_id, sender_id, image_paths) values ($1, $2, $3)", [conv, amara, [`${conv}/a.png`]], /Invalid attachment/);
  await fails("and sit directly in the conversation's folder", "insert into public.messages (conversation_id, sender_id, image_paths) values ($1, $2, $3)", [conv, amara, [`${conv}/../a.webp`]], /Invalid attachment/);
}

console.log("\nAutomatic check");
{
  const service = () => db.exec("reset role; select set_config('request.jwt.claim.sub', '', false); set role service_role;");
  const newcomer = await createUser("newcomer@example.com", { username: "newcomer" });
  await as(newcomer);
  const first = await post("My first post, with a poll", "en", null, null, null, null, null, null, "[]", JSON.stringify({ options: ["Yes", "No"] }));
  check("a new member's post goes up straight away", (await one("select status from public.posts where id = $1", [first])).status === "published");
  await fails("members cannot see what the check reads", "select public.automatic_check_subject($1)", [first], /permission denied/);
  await fails("or hold posts", "select public.automatic_hold($1, '{hate}')", [first], /permission denied/);
  await service();
  row = await one("select public.automatic_check_subject($1) as s", [first]);
  check("the check reads a new member's text and poll", row.s?.text === "My first post, with a poll\nYes\nNo" && row.s.images.length === 0, row);
  await as(mod);
  const modPost = await post("A note from the moderators");
  const regular = await createUser("regular@example.com", { username: "regular" });
  await superuser();
  await q("update public.profiles set created_at = now() - interval '2 days' where id = $1", [regular]);
  await as(regular);
  const earlier = await post("Hello again");
  await superuser();
  await q("update public.posts set created_at = now() - interval '1 day' where id = $1", [earlier]);
  await as(regular);
  const later = await post("Back with news");
  await service();
  check("but not a moderator's", (await one("select public.automatic_check_subject($1) as s", [modPost])).s === null);
  check("nor an established member's", (await one("select public.automatic_check_subject($1) as s", [later])).s === null);
  check("whose first post was checked", (await one("select public.automatic_check_subject($1) as s", [earlier])).s !== null);
  await fails("categories are checked", "select public.automatic_hold($1, $2)", [first, ["Not a category"]], /Invalid categories/);
  const countBefore = (await one("select posts_count from public.profiles where id = $1", [newcomer])).posts_count;
  await q("select public.automatic_hold($1, $2)", [first, ["harassment", "hate"]]);
  row = await one("select status, moderation_note from public.posts where id = $1", [first]);
  check("a flagged post goes back to review, never rejected", row.status === "pending" && row.moderation_note === "Held for review after an automatic check", row);
  check("and stops counting on the profile", (await one("select posts_count from public.profiles where id = $1", [newcomer])).posts_count === countBefore - 1);
  check("a post is checked once", (await one("select public.automatic_check_subject($1) as s", [first])).s === null);
  await as(kofi);
  check("members cannot read flags", (await q("select * from public.post_flags")).length === 0);
  await as(mod);
  row = await one("select flags from public.review_queue where target_id = $1", [first]);
  check("moderators see the categories in the review queue", row?.flags?.join() === "harassment,hate", row);
  await q("select public.moderate_approve_posts(array[$1]::uuid[])", [first]);
  check("a moderator can publish it again", (await one("select status from public.posts where id = $1", [first])).status === "published");
  await as(newcomer);
  const second = await post("Another post");
  await service();
  await q("select public.automatic_hold($1, '{violence}')", [second]);
  await as(newcomer);
  await q("select public.delete_post($1)", [second]);
  await superuser();
  check("deleting a post forgets its flags", (await q("select 1 from public.post_flags where post_id = $1", [second])).length === 0);
  await service();
  await q("select public.automatic_hold($1, '{violence}')", [second]);
  check("a deleted post isn't held", (await q("select 1 from public.post_flags where post_id = $1", [second])).length === 0);
}

console.log("\nRepeated posts");
{
  const repeater = await createUser("repeater@example.com", { username: "repeater" });
  await as(repeater);
  const status = async (id) => (await one("select status, moderation_note from public.posts where id = $1", [id]));
  const ad = "Cheap flights to Nairobi, message me now";
  const once = await post(ad);
  const twice = await post(`  ${ad.toUpperCase()}  `);
  check("the same text twice goes up", (await status(once)).status === "published" && (await status(twice)).status === "published");
  const third = await post(ad.replace(" ", "\n"));
  row = await status(third);
  check("a third copy in an hour waits for review, ignoring case and spacing", row.status === "pending" && row.moderation_note === "Held for review: posted several times in an hour", row);
  check("short replies can repeat", (await Promise.all([1, 2, 3].map(async () => (await status(await post("Congratulations!"))).status)))
    .every((s) => s === "published"));
  await superuser();
  await q("update public.posts set created_at = now() - interval '2 hours' where created_by = $1", [repeater]);
  await as(repeater);
  check("copies older than an hour don't count", (await status(await post(ad))).status === "published");
  await as(mod);
  check("moderators see the held copy", (await q("select 1 from public.review_queue where target_id = $1", [third])).length === 1);
}

console.log("\nConversation");
{
  const user = (name) => createUser(`${name}@example.com`, { username: name });
  const writer = await user("conv_writer");
  const first = await user("conv_first");
  const second = await user("conv_second");
  const third = await user("conv_third");
  const reader = await user("conv_reader");
  const blocked = await user("conv_blocked");
  const muted = await user("conv_muted");
  const friend = await user("conv_friend");

  await as(writer);
  const root = await post("Where's the best suya in Brisbane?");
  const other = await post("And the best jollof?");
  const continued = await post("Asking for a market stall", "en", null, root);
  await as(first);
  const firstReply = await post("Try the West End markets", "en", null, root);
  await as(blocked);
  await post("Nowhere good", "en", null, root);
  await as(muted);
  await post("Who cares", "en", null, root);
  await as(second);
  const secondReply = await post("Mt Gravatt has a good one", "en", null, root);
  await as(third);
  const deleted = await post("Ignore me", "en", null, root);
  await q("select public.delete_post($1)", [deleted]);
  const thirdReply = await post("Agreed with @conv_second", "en", null, root);
  const otherReply = await post("Mine, obviously", "en", null, other);
  await as(reader);
  await q("insert into public.blocks (blocker_id, blocked_id) values ($1, $2)", [reader, blocked]);
  await q("insert into public.mutes (muter_id, muted_id) values ($1, $2)", [reader, muted]);
  await q("insert into public.follows (follower_id, followee_id) values ($1, $2)", [reader, friend]);

  rows = await q("select id, parent_id from public.reply_previews($1::uuid[], 3)", [`{${root},${other}}`]);
  const under = (id) => rows.filter((r) => r.parent_id === id).map((r) => r.id);
  check("previews show the newest replies under each post, oldest first", JSON.stringify(under(root)) === JSON.stringify([firstReply, secondReply, thirdReply]), under(root));
  check("previews for a whole page come from one query", JSON.stringify(under(other)) === JSON.stringify([otherReply]), under(other));
  check("previews leave out the thread's continuation, blocked and muted people and deleted replies", !rows.some((r) => [continued, deleted].includes(r.id)) && rows.length === 4, rows.length);
  check("previews show at most 5 replies, and none when asked for none",
    (await q("select id from public.reply_previews($1::uuid[], 50)", [`{${root}}`])).length === 3 && (await q("select id from public.reply_previews($1::uuid[], 0)", [`{${root}}`])).length === 0);
  await anon();
  check("guests see previews", (await q("select id from public.reply_previews($1::uuid[], 2)", [`{${root}}`])).length === 2);

  const hot = async (id) => (await one("select hot_score from public.posts where id = $1", [id])).hot_score;
  const before = await hot(root);
  await as(friend);
  await q("insert into public.likes (user_id, post_id) values ($1, $2)", [friend, secondReply]);
  check("a like on a reply counts towards its thread's trending score", (await hot(root)) > before, { before, after: await hot(root) });
  const liked = await hot(root);
  await as(first);
  await q("insert into public.likes (user_id, post_id) values ($1, $2)", [first, secondReply]);
  check("someone who already replied counts once", (await hot(root)) === liked);

  await as(reader);
  const draw = async (seed, limit = 50, after = null) =>
    q("select trending_score::text as score, post->>'id' as id from public.feed_trending($1, $2, $3, $4)", [seed, after?.score ?? null, after?.id ?? null, limit]);
  const all = await draw(7);
  check("the same seed draws the same order", JSON.stringify(all) === JSON.stringify(await draw(7)));
  const orders = new Set();
  for (const seed of [1, 2, 3, 4, 5, 6, 8, 9]) orders.add((await draw(seed)).map((r) => r.id).join());
  check("other seeds draw other orders", orders.size > 1, orders.size);
  const paged = [];
  let page = await draw(7, 2);
  while (page.length > 0) {
    paged.push(...page);
    page = await draw(7, 2, page.at(-1));
  }
  check("later pages of a draw continue it without overlapping", JSON.stringify(paged) === JSON.stringify(all) && new Set(paged.map((r) => r.id)).size === paged.length, { paged: paged.length, all: all.length });
  await as(muted);
  const mutedPost = await post("A top-level post from someone muted");
  await as(reader);
  check("trending leaves out people the viewer muted", !(await draw(7)).some((r) => r.id === mutedPost));
  check("a draw is in order of its scores", all.every((r, i) => i === 0 || Number(all[i - 1].score) >= Number(r.score)));

  await as(writer);
  rows = await q("select username, following, follows_you from public.post_likers($1)", [secondReply]).catch(() => null);
  check("only the author sees who liked a post", rows === null);
  await as(second);
  rows = await q("select username from public.post_likers($1)", [secondReply]);
  check("the author sees who liked their post, newest first", rows.map((r) => r.username).join() === "conv_first,conv_friend", rows);
  await q("insert into public.blocks (blocker_id, blocked_id) values ($1, $2)", [second, friend]);
  check("who liked a post leaves out blocked people", (await q("select username from public.post_likers($1)", [secondReply])).map((r) => r.username).join() === "conv_first");
  rows = await q("select username from public.post_likers($1, now() - interval '1 day')", [secondReply]);
  check("who liked a post pages by time", rows.length === 0, rows);
  await anon();
  await fails("guests cannot see who liked a post", "select * from public.post_likers($1)", [secondReply], /permission denied/);

  await as(reader);
  rows = await q("select username from public.mention_suggestions('', $1)", [thirdReply]);
  check(
    "replies suggest the person replied to, the thread's author, the others in it, then people you follow",
    rows.map((r) => r.username).join() === "conv_third,conv_writer,conv_second,conv_first,conv_friend",
    rows.map((r) => r.username),
  );
  rows = await q("select username from public.mention_suggestions('conv_', $1, null, 20)", [thirdReply]);
  check("typing keeps the conversation first, then matches everyone else", rows[0]?.username === "conv_third" && rows.some((r) => r.username === "conv_writer") && rows.at(-1)?.username !== "conv_third", rows.map((r) => r.username));
  check("suggestions leave out the writer, muted and blocked people", !rows.some((r) => ["conv_reader", "conv_muted", "conv_blocked"].includes(r.username)), rows.map((r) => r.username));
  rows = await q("select username from public.mention_suggestions('', null, $1)", [root]);
  check("quotes suggest the quoted author first", rows[0]?.username === "conv_writer" && rows.length === 2, rows.map((r) => r.username));
  rows = await q("select username from public.mention_suggestions('')");
  check("a bare @ elsewhere suggests people you follow", rows.map((r) => r.username).join() === "conv_friend", rows);
  await anon();
  await fails("guests get no mention suggestions", "select * from public.mention_suggestions('conv')", [], /permission denied/);

  await as(writer);
  await q("insert into public.follows (follower_id, followee_id) values ($1, $2)", [writer, reader]);
  await as(reader);
  row = await one("select username, follows_you, following, posts_count from public.profile_preview('Conv_Writer')");
  check("profile cards say whether they follow you", row.username === "conv_writer" && row.follows_you && !row.following && row.posts_count === 2, row);
  check("profile cards are empty across a block", (await q("select * from public.profile_preview('conv_blocked')")).length === 0);
  await anon();
  check("guests see profile cards", (await one("select follows_you from public.profile_preview('conv_writer')")).follows_you === false);
}

console.log("\nOperations");
{
  // Members from earlier sections joined recently; move them out of both ranges
  // so only the sign-ups made here are counted.
  await superuser();
  await q("update public.profiles set created_at = now() - interval '90 days' where account_type = 'person'");
  const lead = (await one("select id from public.profiles where username = 'site_lead'")).id;
  const joinedAgo = (id, interval) => q("update public.profiles set created_at = now() - $2::interval where id = $1", [id, interval]);

  const ada = await createUser("ops_ada@example.com", { username: "ops_ada" });
  const ben = await createUser("ops_ben@example.com", { username: "ops_ben" });
  const cy = await createUser("ops_cy@example.com", { username: "ops_cy" });
  // Activation: a reader who liked posts by 3 people, an author whose post was liked, and someone who did neither.
  const reader = await createUser("ops_reader@example.com", { username: "ops_reader" });
  const author = await createUser("ops_author@example.com", { username: "ops_author" });
  const quiet = await createUser("ops_quiet@example.com", { username: "ops_quiet" });
  const fresh = await createUser("ops_fresh@example.com", { username: "ops_fresh" });
  await as(ada);
  const byAda = await post("Activation post by Ada");
  await as(ben);
  const byBen = await post("Activation post by Ben");
  await as(cy);
  const byCy = await post("Activation post by Cy");
  await as(reader);
  for (const id of [byAda, byBen, byCy]) await q("insert into public.likes (user_id, post_id) values ($1, $2)", [reader, id]);
  await as(fresh);
  for (const id of [byAda, byBen, byCy]) await q("insert into public.likes (user_id, post_id) values ($1, $2)", [fresh, id]);
  await as(author);
  const hello = await post("Hello, I just joined");
  await as(ben);
  await q("insert into public.likes (user_id, post_id) values ($1, $2)", [ben, hello]);
  await superuser();
  for (const id of [reader, author, quiet]) await joinedAgo(id, "13 hours");
  await q("update public.likes set created_at = now() - interval '12 hours 30 minutes' where user_id = $1 or post_id = $2", [reader, hello]);
  await q("update public.posts set created_at = now() - interval '12 hours 30 minutes' where id = $1", [hello]);

  // First day: one newcomer followed two people in their first day, another nobody. Neither is activated.
  const follower = await createUser("ops_follower@example.com", { username: "ops_follower" });
  const loner = await createUser("ops_loner@example.com", { username: "ops_loner" });
  await as(follower);
  await q("insert into public.follows (follower_id, followee_id) values ($1, $2), ($1, $3)", [follower, ada, ben]);
  await superuser();
  for (const id of [follower, loner]) await joinedAgo(id, "2 days");
  await q("update public.follows set created_at = now() - interval '47 hours' where follower_id = $1", [follower]);

  // Answered: a first post replied to after 30 minutes, and a post only its author liked.
  const newcomer = await createUser("ops_newcomer@example.com", { username: "ops_newcomer" });
  await as(newcomer);
  const firstPost = await post("My very first post");
  await as(ben);
  const reply = await post("Welcome!", "en", null, firstPost);
  await as(ada);
  const ignored = await post("Anyone around?");
  await superuser();
  // Members can't like their own posts, but a like from the author must not count if one ever exists.
  await q("insert into public.likes (user_id, post_id) values ($1, $2)", [ada, ignored]);
  await q("update public.posts set created_at = now() - interval '2 days', published_at = now() - interval '2 days' where id = $1", [firstPost]);
  await q("update public.posts set created_at = now() - interval '2 days' + interval '30 minutes' where id = $1", [reply]);
  await q("update public.posts set published_at = now() - interval '2 days' where id = $1", [ignored]);

  // The period before: someone who joined 40 days ago.
  await joinedAgo(await createUser("ops_earlier@example.com", { username: "ops_earlier" }), "40 days");

  await as(lead);
  const metrics = (await one("select public.admin_metrics(30) as m")).m;
  const { activation, activationByDay, firstDay, answered } = metrics.current;
  check("activation counts value received within 12 hours, from sign-ups at least 12 hours old", activation.eligible === 5 && activation.activated === 2, activation);
  check(
    "activation is broken down by sign-up day",
    activationByDay.reduce((sum, day) => sum + day.eligible, 0) === 5 && activationByDay.every((day) => typeof day.complete === "boolean"),
    activationByDay,
  );
  check("first-day figures wait for a full first day", firstDay.eligible === 2 && firstDay.followed === 1 && firstDay.medianFollows === 1, firstDay);
  check("posts count as answered by a reply, quote or like from someone else within a day", answered.posts === 2 && answered.answered === 1, answered);
  check("first posts are answered separately, with the median time to an answer", answered.firstPosts === 1 && answered.firstAnswered === 1 && Math.round(answered.medianMinutes) === 30, answered);
  check("the period before has the same rates", metrics.previous.signups === 1 && metrics.previous.activationByDay === undefined && metrics.signups.previousRange === 1, metrics.previous);
  const week = (await one("select public.admin_metrics(7) as m")).m;
  check("a 7-day range has 7 days of bars", week.days === 7 && week.daily.length === 7, week.daily.length);
  await fails("ranges are 7 or 30 days", "select public.admin_metrics(14)", [], /7 or 30/);

  await superuser();
  await q("update public.posts set created_at = now() - interval '1 day' where id = $1", [byCy]);
  await as(lead);
  const activity = (await one("select public.admin_activity(7) as a")).a;
  check(
    "activity compares today with yesterday",
    ["posts", "replies", "signups", "messages", "reports"].every((name) => typeof activity.compare[name]?.today === "number") && activity.compare.posts.yesterday >= 1,
    activity.compare,
  );
  check("activity breaks posts down by status, in order", activity.statuses.map((s) => s.status).join() === "published,pending,rejected,deleted", activity.statuses);
  check("the busiest authors are at most 10, busiest first", activity.authors.length <= 10 && activity.authors.length > 0 && activity.authors.every((a, i, all) => i === 0 || all[i - 1].posts >= a.posts), activity.authors);

  const before = (await one("select public.admin_health() as h")).h;
  check("health says when pg_cron can't be read", before.cron === null, before.cron);
  await superuser();
  await q("insert into public.scheduled_posts (created_by, author_id, body, scheduled_at) values ($1, $1, 'Stuck', now() - interval '10 minutes')", [quiet]);
  await q("update public.profile_settings set age_deactivated_at = now() - interval '32 days' where id = $1", [loner]);
  await db.exec(`
    create schema cron;
    create table cron.job (jobid bigint primary key, jobname text, schedule text, active boolean default true);
    create table cron.job_run_details (runid bigserial primary key, jobid bigint, status text, return_message text, start_time timestamptz);
    insert into cron.job values (1, 'mavuno-purge-deleted-posts', '* * * * *');
    insert into cron.job_run_details (jobid, status, return_message, start_time) values
      (1, 'failed', 'ERROR: boom', now() - interval '2 minutes'),
      (1, 'succeeded', '1 row', now() - interval '1 minute');
  `);
  await as(lead);
  const after = (await one("select public.admin_health() as h")).h;
  check("health counts scheduled posts overdue by more than 5 minutes", after.overdueScheduled === before.overdueScheduled + 1 && after.oldestOverdueScheduled !== null, after);
  check("health counts accounts waiting to be deleted for age, and overdue ones", after.ageDeactivated === before.ageDeactivated + 1 && after.agePurgeOverdue === before.agePurgeOverdue + 1, after);
  check(
    "health lists pg_cron jobs with failed runs in the last day",
    after.cron?.length === 1 && after.cron[0].failedLastDay === 1 && after.cron[0].lastStatus === "succeeded" && after.cron[0].lastError === "ERROR: boom",
    after.cron,
  );
  await superuser();
  await db.exec("drop schema cron cascade");

  await as(ada);
  await fails("members cannot see activity", "select public.admin_activity()", [], /Only admins/);
  for (const sql of ["select public.cron_health()", "select public.metric_rates(current_date, current_date)"]) await fails(`members cannot call ${sql.slice(14, sql.indexOf("("))}`, sql, [], /permission denied/);
}

console.log("\nDemo seed");
const seeded = new PGlite({ extensions: { pg_trgm, pgcrypto } });
await seeded.exec(stubs);
for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) await seeded.exec(readFileSync(join(dir, file), "utf8"));
await seeded.exec(readFileSync(join(root, "supabase/seed.sql"), "utf8"));
const counts = (await seeded.query("select (select count(*)::int from public.profiles) as profiles, (select count(*)::int from public.posts where status = 'published') as posts, (select count(*)::int from public.events where status = 'published') as events, (select premoderation from public.site_settings) as premoderation")).rows[0];
check("the demo seed creates people, an organisation, published posts and an event", counts.profiles === 5 && counts.posts === 5 && counts.events === 1 && counts.premoderation === false, counts);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
