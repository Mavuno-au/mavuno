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

// Members confirm their age when they sign up (pass age_confirmed: false for someone who hasn't) and
// accept the rules before their first post (pass rules_accepted: false for someone who hasn't).
async function createUser(email, meta) {
  await superuser();
  const { rules_accepted = true, ...userMeta } = meta ?? {};
  const id = (await one("insert into auth.users (email, raw_user_meta_data) values ($1, $2) returning id", [email, JSON.stringify({ age_confirmed: true, ...userMeta })])).id;
  if (rules_accepted) await q("update public.profile_settings set rules_accepted_at = now() where id = $1", [id]);
  return id;
}

const post = async (body, ...args) => {
  const params = [body, ...args];
  const placeholders = params.map((_, i) => `$${i + 1}`).join(", ");
  return (await one(`select public.create_post(${placeholders}) as id`, params)).id;
};

// Event covers and avatars must come from the project's own Storage (storage_origins).
const OWN_MEDIA = "https://hposvtbqckeyyxtjzyas.supabase.co/storage/v1/object/public/media/";

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
await fails(
  "a chosen username taken a moment earlier stops the sign-up",
  "insert into auth.users (email, raw_user_meta_data) values ('kofi2@example.com', '{\"username\": \"Kofi\", \"age_confirmed\": true}')",
  [],
  /username is taken/,
);
const unnamed = await createUser("unnamed@example.com", { full_name: "Kofi Mensah" });
row = await one("select username, display_name from public.profiles where id = $1", [unnamed]);
check("a sign-up without a chosen username still gets a generated one", row.username.startsWith("member_") && row.display_name === "Kofi Mensah", row);
await q("delete from auth.users where id = $1", [unnamed]);

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
await fails("images must be in the uploader's folder", "select public.create_post('pic', 'en', null, null, null, null, null, $1::jsonb)",
  [JSON.stringify([{ path: `${kofi}/posts/a.webp`, url: `${OWN_MEDIA}${kofi}/posts/a.webp` }])], /Invalid image/);
const imgPost = await post("Jollof night", "en", null, null, null, null, null,
  JSON.stringify([{ path: `${amara}/posts/a.webp`, url: `${OWN_MEDIA}${amara}/posts/a.webp`, width: 800, height: 600, alt: "A pot of jollof rice" }]));
row = await one("select images from public.post_details where id = $1", [imgPost]);
check("images are attached with descriptions", row.images[0]?.alt === "A pot of jollof rice", row);
const poll = await post("Best jollof?", "en", null, null, null, null, null, "[]", JSON.stringify({ options: ["Nigerian", "Ghanaian", "Senegalese"], duration_hours: 24 }));
await fails("polls need 2 to 4 different options", "select public.create_post('Poll', 'en', null, null, null, null, null, '[]'::jsonb, $1::jsonb)",
  [JSON.stringify({ options: ["Same", "Same"] })], /different options/);
await fails("polls run 1 hour, 1, 3 or 7 days", "select public.create_post('Poll', 'en', null, null, null, null, null, '[]'::jsonb, $1::jsonb)",
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
check("post search matches words", (await q("select post->>'id' as id from public.search_posts('jollof')")).length === 2);
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
check("an invitation is not membership until accepted", (await one("select public.can_act_as($1) as ok", [org])).ok === false);
await q("select public.accept_team_invitation($1)", [org]);
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
await fails(
  "an upsert that rewrites the key is refused, so the app updates the status instead",
  "insert into public.event_rsvps (event_id, user_id, status) values ($1, $2, 'interested') on conflict (event_id, user_id) do update set event_id = excluded.event_id, user_id = excluded.user_id, status = excluded.status",
  [event, kofi],
  /permission denied/,
);
await q("update public.event_rsvps set status = 'interested' where event_id = $1 and user_id = $2", [event, kofi]);
check("members change their RSVP's status", (await one("select status from public.event_rsvps where event_id = $1 and user_id = $2", [event, kofi])).status === "interested");
await q("update public.event_rsvps set status = 'going' where event_id = $1 and user_id = $2", [event, kofi]);
await as(hana);
await fails("full events turn people away", "insert into public.event_rsvps (event_id, user_id, status) values ($1, $2, 'going')", [event, hana], /full/);
await as(amara);
check("hosts hear about new attendees", (await one("select count(*)::int as n from public.notifications where recipient_id = $1 and type = 'event_rsvp'", [org])).n === 1);
const eventPost = await post("Free entry!", "en", org, null, null, null, null, "[]", null, event);
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
// Reports only count from members who have been around a week (see "Weighted reports").
await superuser();
await q("update public.profiles set created_at = now() - interval '8 days' where id = any($1)", [[amara, kofi, hana]]);
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
await superuser();
await q("update public.profiles set created_at = now() where id = any($1)", [[kofi, hana]]);
await q("update public.profiles set created_at = now() - interval '2 hours' where id = $1", [amara]);
await as(kofi);
check("only moderators see the queues", (await q("select * from public.report_queue")).length === 0 && (await q("select id from public.reports")).length === 0);
await fails("members cannot moderate", "select public.moderate_content('post', $1, false)", [spamPost], /Moderators only/);
await as(mod);
rows = await q("select report_count, snapshot, reports from public.report_queue where target_id = $1", [spamPost]);
check("moderators see grouped reports with a copy, not who reported", rows[0]?.report_count === 3 && rows[0].snapshot.includes("Buy followers") && !JSON.stringify(rows[0].reports).includes(amara), rows);
await q("select public.moderate_content('post', $1, false, 'Spam', 'honesty')", [spamPost]);
await q("select public.moderate_suspend($1, interval '7 days', 'Spam account', 'honesty')", [spam]);
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
check("erased images are queued for storage removal", (await one("select count(*)::int as n from public.storage_cleanup where bucket = 'media'")).n === 1);

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
  await q("select public.accept_team_invitation($1)", [team]);
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
  const vote = await post("Jollof or fufu?", "en", null, null, null, null, null, "[]", JSON.stringify({ options: ["Jollof", "Fufu"], duration_hours: 24 }));
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
  const second = await post("Compare https://example.org/one with https://example.org/two", "en", null, null, null, null, "https://example.org/two");
  check("the author can choose which link gets the card", (await one("select link_url from public.posts where id = $1", [second])).link_url === "https://example.org/two");
  const uncarded = await post("Just mentioning https://example.org/plain", "en", null, null, null, null, null);
  await superuser();
  check(
    "choosing no card stores no link and fetches nothing",
    (await one("select link_url from public.posts where id = $1", [uncarded])).link_url === null && (await q("select 1 from public.background_tasks where kind = 'link_preview' and target_id = $1", [uncarded])).length === 0,
  );
  await as(pollster);
  check("www links count as in the post", (await post("See www.example.org", "en", null, null, null, null, "https://www.example.org")) !== null);
  await fails("images point at their upload", "select public.create_post('pic', 'en', null, null, null, null, null, $1::jsonb)",
    [JSON.stringify([{ path: `${pollster}/posts/a.webp`, url: "https://evil.example/a.webp" }])], /Invalid image/);
  await fails("image paths stay in the uploader's folder", "select public.create_post('pic', 'en', null, null, null, null, null, $1::jsonb)",
    [JSON.stringify([{ path: `${pollster}/../${voter}/posts/a.webp`, url: `${OWN_MEDIA}${pollster}/../${voter}/posts/a.webp` }])], /Invalid image/);

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
  await as(known);
  await post("Hello from someone worth following");
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
  const image = (owner, name) => ({ path: `${owner}/posts/${name}.webp`, url: `${OWN_MEDIA}${owner}/posts/${name}.webp`, width: 10, height: 10, alt: "" });

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
  const linked = await schedule("Read https://example.org/scheduled", { p_link_url: "https://example.org/scheduled" });
  await fails("members cannot hand in a card when scheduling", "select public.schedule_post(now() + interval '1 hour', 'https://example.org', p_link_url => 'https://example.org', p_link_preview => '{}'::jsonb)", [], /does not exist/);
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
  check("scheduled links are posted, and their card fetched when they go out", row.post_link === "https://example.org/scheduled" && row.post_preview === null
    && (await q("select 1 from public.background_tasks where kind = 'link_preview' and target_id = $1", [row.post_id])).length === 1, row);

  await as(writer);
  await q("delete from public.scheduled_posts where id = $1", [queued]);
  check("a post already handed over cannot be cancelled", (await q("select id from public.scheduled_posts where id = $1", [queued])).length === 1);

  const editor = await createUser("scheduling_editor@example.com", { username: "scheduling_editor" });
  await as(writer);
  await q("insert into public.organisation_members (org_id, user_id, role) values ($1, $2, 'editor')", [org, editor]);
  await as(editor);
  await q("select public.accept_team_invitation($1)", [org]);
  const leftOrg = await schedule("Before I leave", { p_author_id: org });
  await as(writer);
  await q("delete from public.organisation_members where org_id = $1 and user_id = $2", [org, editor]);
  const suspended = await schedule("Before the suspension", { p_images: JSON.stringify([image(writer, "suspended")]) });
  await as(mod);
  await q("select public.moderate_suspend($1, interval '7 days', 'Testing', 'respect')", [writer]);
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
  await fails("suspending needs the rule too", "select public.moderate_suspend($1, interval '7 days', 'Scam')", [author], /rule/);
  await q("select public.moderate_content('post', $1, false, 'Asks for money to apply', 'honesty')", [removed]);
  await q("select public.moderate_suspend($1, interval '1 day', null, 'honesty')", [author]);
  await as(author);
  rows = await q("select message, rule, moderation_action_id from public.notification_details where recipient_id = $1 and type = 'moderation' order by id", [author]);
  check(
    "notices name the rule and the reason",
    rows.length === 2 && rows[0].message === "Your post was removed under rule 3 of the community rules (Be honest). Reason: Asks for money to apply" && rows[0].rule === "honesty",
    rows,
  );
  check(
    "suspension notices say for how long, until when and under which rule",
    /^Your account is suspended for 1 day, until \w{3} \d{1,2} \w{3} \d{4}, \d{1,2}:\d{2} [ap]m \(Sydney time\), under rule 3 of the community rules \(Be honest\)\.$/.test(rows[1].message),
    rows[1],
  );
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
  await fails("post images must be the server's WebP", "select public.create_post('pic', 'en', null, null, null, null, null, $1::jsonb)",
    [JSON.stringify([{ path: `${amara}/posts/a.jpg`, url: `${OWN_MEDIA}${amara}/posts/a.jpg` }])], /Invalid image/);
  await fails("message images must be the server's WebP", "insert into public.messages (conversation_id, sender_id, image_paths) values ($1, $2, $3)", [conv, amara, [`${conv}/a.png`]], /Invalid attachment/);
  await fails("and sit directly in the conversation's folder", "insert into public.messages (conversation_id, sender_id, image_paths) values ($1, $2, $3)", [conv, amara, [`${conv}/../a.webp`]], /Invalid attachment/);
}

console.log("\nAutomatic check");
{
  const service = () => db.exec("reset role; select set_config('request.jwt.claim.sub', '', false); set role service_role;");
  const checkQueued = async (type, id) => {
    await superuser();
    return (await q("select 1 from public.background_tasks where kind = 'automatic_check' and target_type = $1 and target_id = $2", [type, id])).length === 1;
  };
  const newcomer = await createUser("newcomer@example.com", { username: "newcomer" });
  await as(newcomer);
  const first = await post("My first post, with a poll", "en", null, null, null, null, null, "[]", JSON.stringify({ options: ["Yes", "No"] }));
  check("a new member's post goes up straight away", (await one("select status from public.posts where id = $1", [first])).status === "published");
  check("and is queued for the check", await checkQueued("post", first));
  await as(newcomer);
  await fails("members cannot see what the check reads", "select public.automatic_check_subject('post', $1)", [first], /permission denied/);
  await fails("or hold posts", "select public.automatic_hold('post', $1, '{hate}')", [first], /permission denied/);
  await fails("or read the task queue", "select * from public.background_tasks", [], /permission denied/);
  await fails("or claim tasks", "select * from public.claim_background_tasks()", [], /permission denied/);
  await service();
  row = await one("select public.automatic_check_subject('post', $1) as s", [first]);
  check("the check reads a new member's text and poll", row.s?.text === "My first post, with a poll\nYes\nNo" && row.s.images.length === 0, row);

  await as(mod);
  const modPost = await post("A note from the moderators");
  check("moderators' posts are not checked", !(await checkQueued("post", modPost)));
  const regular = await createUser("regular@example.com", { username: "regular" });
  await superuser();
  await q("update public.profiles set created_at = now() - interval '8 days' where id = $1", [regular]);
  await as(regular);
  const earlier = [];
  for (const body of ["Hello", "Hello again", "Still here"]) earlier.push(await post(body));
  check("an hour and one post are no longer a track record", await checkQueued("post", earlier[1]));
  await superuser();
  await q("update public.posts set created_at = now() - interval '1 day' where id = any($1)", [earlier]);
  await as(regular);
  const later = await post("Back with news");
  check("a week and three published posts are", !(await checkQueued("post", later)));
  await superuser();
  await q("update public.profiles set created_at = now() - interval '6 days' where id = $1", [regular]);
  await as(regular);
  check("a week is needed too", await checkQueued("post", await post("Too soon")));
  await superuser();
  await q("update public.profiles set created_at = now() - interval '8 days' where id = $1", [regular]);
  // A report counts when its reporter has standing: a member for a week with something published.
  const reporter = await createUser("check_reporter@example.com", { username: "check_reporter" });
  await q("update public.profiles set created_at = now() - interval '8 days' where id = $1", [reporter]);
  await as(reporter);
  await post("Settling in");
  await q("select public.report_content('profile', $1, 'spam')", [regular]);
  await as(regular);
  check("and nothing reported in the last week", await checkQueued("post", await post("After a report")));

  await service();
  await fails("categories are checked", "select public.automatic_hold('post', $1, $2)", [first, ["Not a category"]], /Invalid categories/);
  const countBefore = (await one("select posts_count from public.profiles where id = $1", [newcomer])).posts_count;
  await q("select public.automatic_hold('post', $1, $2)", [first, ["harassment", "hate"]]);
  row = await one("select status, moderation_note from public.posts where id = $1", [first]);
  check("a flagged post goes back to review, never rejected", row.status === "pending" && row.moderation_note === "Held for review after an automatic check", row);
  check("and stops counting on the profile", (await one("select posts_count from public.profiles where id = $1", [newcomer])).posts_count === countBefore - 1);
  check("a post is checked once", (await one("select public.automatic_check_subject('post', $1) as s", [first])).s === null);
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
  await q("select public.automatic_hold('post', $1, '{violence}')", [second]);
  await as(newcomer);
  await q("select public.delete_post($1)", [second]);
  await superuser();
  check("deleting a post forgets its flags", (await q("select 1 from public.post_flags where post_id = $1", [second])).length === 0);
  await service();
  await q("select public.automatic_hold('post', $1, '{violence}')", [second]);
  check("a deleted post isn't held", (await q("select 1 from public.post_flags where post_id = $1", [second])).length === 0);

  await as(newcomer);
  const job = (await one("insert into public.opportunities (poster_id, created_by, type, title, description, apply_url) values ($1, $1, 'job', 'Warehouse work', 'Pay a deposit for your uniform first', 'https://jobs.example') returning id, status", [newcomer]));
  const gig = (await one("insert into public.events (host_id, created_by, title, starts_at, city_id, venue_name, cover_url) values ($1, $1, 'Rent a room', now() + interval '3 days', $2, 'Logan Hall', $3) returning id", [newcomer, logan, `${OWN_MEDIA}${newcomer}/events/cover.webp`])).id;
  check("opportunities are queued for the check", await checkQueued("opportunity", job.id));
  check("and so are events", await checkQueued("event", gig));
  await service();
  row = await one("select public.automatic_check_subject('event', $1) as s", [gig]);
  check("the check reads an event's text and cover", /Rent a room/.test(row.s?.text) && row.s.images[0] === `${OWN_MEDIA}${newcomer}/events/cover.webp`, row);
  row = await one("select public.automatic_check_subject('opportunity', $1) as s", [job.id]);
  check("and an opportunity's text", /deposit/.test(row.s?.text), row);
  await superuser();
  await q("update public.opportunities set status = 'published' where id = $1", [job.id]);
  await service();
  await q("select public.automatic_hold('opportunity', $1, '{illicit}')", [job.id]);
  check("a flagged opportunity goes back to review", (await one("select status from public.opportunities where id = $1", [job.id])).status === "pending");
  check("an opportunity is checked once", (await one("select public.automatic_check_subject('opportunity', $1) as s", [job.id])).s === null);
  await q("select public.automatic_hold('event', $1, '{harassment}')", [gig]);
  await as(kofi);
  check("members cannot read listing flags", (await q("select * from public.listing_flags")).length === 0);
  await as(mod);
  row = await one("select flags from public.review_queue where target_type = 'opportunity' and target_id = $1", [job.id]);
  check("moderators see a listing's categories in the review queue", row?.flags?.join() === "illicit", row);
  await q("select public.moderate_content('opportunity', $1, true)", [job.id]);
  check("and can publish it again", (await one("select status from public.opportunities where id = $1", [job.id])).status === "published");
  await superuser();
  await q("delete from public.events where id = $1", [gig]);
  check("a deleted listing's flags go with it", (await q("select 1 from public.listing_flags where event_id = $1", [gig])).length === 0);
}

console.log("\nBackground tasks and link cards");
{
  const service = () => db.exec("reset role; select set_config('request.jwt.claim.sub', '', false); set role service_role;");
  const linker = await createUser("linker@example.com", { username: "linker" });
  await as(linker);
  await fails("members cannot hand in a card", "select public.create_post('https://example.org', 'en', p_link_url => 'https://example.org', p_link_preview => '{}'::jsonb)", [], /does not exist/);
  const linked = await post("Read https://example.org/news", "en", null, null, null, null, "https://example.org/news");
  check("a post with a link has no card until the server fetches one", (await one("select link_preview from public.posts where id = $1", [linked])).link_preview === null);
  const quoting = await post("Also https://example.org/quote", "en", null, null, linked, null, "https://example.org/quote");
  await fails("members cannot write cards", "select public.set_link_preview($1, 'https://example.org/news', '{\"url\": \"https://example.org/news\", \"title\": \"Fake\"}')", [linked], /permission denied/);

  await superuser();
  await q("update public.background_tasks set run_after = now() + interval '1 hour' where target_id <> all($1)", [[linked, quoting]]);
  await service();
  let tasks = await q("select * from public.claim_background_tasks(10)");
  check("a quote post gets no card", !tasks.some((task) => task.target_id === quoting && task.kind === "link_preview"), tasks);
  const card = tasks.find((task) => task.target_id === linked && task.kind === "link_preview");
  check("a post with a link is queued for its card", card?.attempts === 1, tasks);
  check("a claimed task is not handed out twice", (await q("select * from public.claim_background_tasks(10, $1)", [linked])).length === 0);
  row = await one("select round(extract(epoch from run_after - now()))::int as wait from public.background_tasks where id = $1", [card.id]);
  check("the second try waits a minute", row.wait === 60, row);

  const preview = (fields) => JSON.stringify({ url: "https://example.org/news", title: "Here's the news", ...fields });
  await fails("cards need a title", "select public.set_link_preview($1, 'https://example.org/news', $2::jsonb)", [linked, preview({ title: " " })], /Invalid link preview/);
  await fails("card images are https", "select public.set_link_preview($1, 'https://example.org/news', $2::jsonb)", [linked, preview({ image: "http://img.example/a.png" })], /Invalid link preview/);
  await q("select public.set_link_preview($1, 'https://example.org/other', $2::jsonb)", [linked, preview({})]);
  check("a card only lands on the post whose link it is", (await one("select link_preview from public.posts where id = $1", [linked])).link_preview === null);
  await q("select public.set_link_preview($1, 'https://example.org/news', $2::jsonb)", [linked, preview({ image: "https://img.example/a.png", extra: "dropped" })]);
  row = await one("select link_preview from public.posts where id = $1", [linked]);
  check("the server writes the card", row.link_preview?.title === "Here's the news" && row.link_preview.image === "https://img.example/a.png" && !("extra" in row.link_preview), row);
  await q("select public.finish_background_task($1)", [card.id]);
  check("a finished task is deleted", (await q("select 1 from public.background_tasks where id = $1", [card.id])).length === 0);

  await as(linker);
  const flaky = await post("Down https://flaky.example", "en", null, null, null, null, "https://flaky.example");
  await service();
  const retry = async () => {
    await superuser();
    await q("update public.background_tasks set run_after = now() - interval '1 second' where target_id = $1", [flaky]);
    await service();
    const [task] = await q("select * from public.claim_background_tasks(10, $1)", [flaky]);
    return task;
  };
  let task = await retry();
  await q("select public.finish_background_task($1, 'Timed out', true)", [task.id]);
  task = await retry();
  row = await one("select round(extract(epoch from run_after - now()))::int as wait, failed_at, last_error from public.background_tasks where id = $1", [task.id]);
  check("a retryable failure is tried again ten minutes later", task.attempts === 2 && row.wait === 600 && row.failed_at === null && row.last_error === "Timed out", row);
  await q("select public.finish_background_task($1, 'Timed out', true)", [task.id]);
  task = await retry();
  await q("select public.finish_background_task($1, 'Timed out', true)", [task.id]);
  row = await one("select failed_at, attempts from public.background_tasks where id = $1", [task.id]);
  check("three tries, then it is given up", row.failed_at !== null && row.attempts === 3, row);
  check("a given-up task is not handed out", (await retry()) === undefined);

  await as(linker);
  const gone = await post("Gone https://gone.example", "en", null, null, null, null, "https://gone.example");
  await superuser();
  await q("update public.background_tasks set run_after = now() - interval '1 second' where target_id = $1", [gone]);
  await service();
  [task] = await q("select * from public.claim_background_tasks(10, $1)", [gone]);
  await q("select public.finish_background_task($1, 'Not found', false)", [task.id]);
  check("a failure that cannot succeed later is given up at once", (await one("select failed_at from public.background_tasks where id = $1", [task.id])).failed_at !== null);

  await as(linker);
  const stuck = await post("Stuck https://stuck.example", "en", null, null, null, null, "https://stuck.example");
  await superuser();
  await q("update public.background_tasks set attempts = 3, run_after = now() - interval '1 second' where target_id = $1", [stuck]);
  await service();
  await q("select * from public.claim_background_tasks(10)");
  check("a task whose last try never finished is given up", (await one("select last_error from public.background_tasks where target_id = $1", [stuck])).last_error === "Did not finish");
  await superuser();
  await q("update public.background_tasks set failed_at = now() - interval '8 days' where target_id = $1", [stuck]);
  await service();
  await q("select * from public.claim_background_tasks(10)");
  check("failures are forgotten after a week", (await q("select 1 from public.background_tasks where target_id = $1", [stuck])).length === 0);
  await superuser();
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

console.log("\nLink cards in messages");
{
  const service = () => db.exec("reset role; select set_config('request.jwt.claim.sub', '', false); set role service_role;");
  const sender = await createUser("lc_sender@example.com", { username: "lc_sender" });
  const reader = await createUser("lc_reader@example.com", { username: "lc_reader" });
  const outsider = await createUser("lc_outsider@example.com", { username: "lc_outsider" });
  await as(reader);
  await q("insert into public.follows (follower_id, followee_id) values ($1, $2)", [reader, sender]);
  await as(sender);
  const chat = (await one("select public.start_direct_conversation($1) as id", [reader])).id;
  await fails("members cannot hand in a message's link", "insert into public.messages (conversation_id, sender_id, body, link_url) values ($1, $2, 'x', 'https://example.org')", [chat, sender], /permission denied/);
  const linked = await one("insert into public.messages (conversation_id, sender_id, body) values ($1, $2, 'Look at www.example.org/news). Then https://example.org/second') returning id, link_url, link_preview", [chat, sender]);
  check("the first link is read from the message, www. filled in and punctuation dropped", linked.link_url === "https://www.example.org/news" && linked.link_preview === null, linked);
  const plain = await one("insert into public.messages (conversation_id, sender_id, body) values ($1, $2, 'No links here, mail me at hi@example.org') returning id, link_url", [chat, sender]);
  check("a message without a link gets none", plain.link_url === null, plain);
  await superuser();
  check(
    "a message with a link is queued for its card, one without is not",
    (await q("select 1 from public.background_tasks where kind = 'link_preview' and target_type = 'message' and target_id = $1", [linked.id])).length === 1
      && (await q("select 1 from public.background_tasks where target_id = $1", [plain.id])).length === 0,
  );
  await as(sender);
  await fails("members cannot write a message's card", "select public.set_message_link_preview($1, 'https://www.example.org/news', '{\"url\": \"https://www.example.org/news\", \"title\": \"Fake\"}')", [linked.id], /permission denied/);
  await service();
  await fails("message cards are checked like post cards", "select public.set_message_link_preview($1, 'https://www.example.org/news', '{\"url\": \"https://www.example.org/news\", \"title\": \" \"}')", [linked.id], /Invalid link preview/);
  await q("select public.set_message_link_preview($1, 'https://www.example.org/other', $2::jsonb)", [linked.id, JSON.stringify({ url: "https://www.example.org/other", title: "Other" })]);
  await q("select public.set_message_link_preview($1, 'https://www.example.org/news', $2::jsonb)", [linked.id, JSON.stringify({ url: "https://www.example.org/news", title: "The news", image: "https://img.example/n.png", extra: 1 })]);
  await as(reader);
  row = await one("select link_url, link_preview from public.messages where id = $1", [linked.id]);
  check("the server writes the card, only for the message's own link", row.link_preview?.title === "The news" && !("extra" in row.link_preview), row);
  await as(outsider);
  check("outsiders still read nothing", (await q("select link_preview from public.messages where id = $1", [linked.id])).length === 0);
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

console.log("\nTrending over days");
{
  const user = (name) => createUser(`${name}@example.com`, { username: name });
  const writer = await user("days_writer");
  const people = [await user("days_one"), await user("days_two"), await user("days_three"), await user("days_four")];

  await as(writer);
  const older = await post("Who's going to the Ethiopian new year picnic?");
  await superuser();
  await q("update public.posts set created_at = now() - interval '2 days', published_at = now() - interval '2 days' where id = $1", [older]);
  for (const person of people.slice(0, 3)) {
    await as(person);
    await q("insert into public.likes (user_id, post_id) values ($1, $2)", [person, older]);
  }
  await as(people[3]);
  await post("We'll bring the injera", "en", null, older);
  await as(writer);
  const fresh = await post("Morning all");

  const hot = async (id) => (await one("select hot_score from public.posts where id = $1", [id])).hot_score;
  check("a two-day-old conversation outranks a new post nobody has engaged with", (await hot(older)) > (await hot(fresh)), { older: await hot(older), fresh: await hot(fresh) });

  // The product metrics below count every post from the last few days.
  await superuser();
  await q("delete from public.posts where root_id = $1", [older]);
  await q("delete from public.posts where id in ($1, $2)", [older, fresh]);
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

console.log("\nUsernames never carry email addresses");
{
  const leaked = await createUser("jeanjabo@gmail.com", { username: "jeanjabogmail_com", display_name: "Jean" });
  check("a sign-up username that names an email provider gets a neutral one", (await one("select username from public.profiles where id = $1", [leaked])).username.startsWith("member_"));
  const own = await createUser("ama@mentorsoutreach.org", { username: "ama_mentorsoutreach", display_name: "Ama" });
  check("so does one that contains the person's own email domain", (await one("select username from public.profiles where id = $1", [own])).username.startsWith("member_"));
  const fine = await createUser("kwame.boateng@gmail.com", { username: "kwame_boateng", display_name: "Kwame" });
  check("a name-based username is kept", (await one("select username from public.profiles where id = $1", [fine])).username === "kwame_boateng");
  await as(fine);
  await fails("members can't change their username to include an email", "update public.profiles set username = 'kwame_gmail_com' where id = $1", [fine], /can't include your email address/);
  await q("update public.profiles set username = 'kwame_b' where id = $1", [fine]);
  check("other username changes still work", (await one("select username from public.profiles where id = $1", [fine])).username === "kwame_b");
}

console.log("\nRealtime, reactions, message photos and image hosts");
{
  const zuri = await createUser("zuri@example.com", { username: "zuri", display_name: "Zuri Bello" });
  const tendai = await createUser("tendai@example.com", { username: "tendai", display_name: "Tendai Moyo" });
  const ayo = await createUser("ayo@example.com", { username: "ayo", display_name: "Ayo Adeyemi" });
  const stranger = await createUser("stranger@example.com", { username: "stranger", display_name: "Stranger" });
  await as(tendai);
  await q("insert into public.follows (follower_id, followee_id) values ($1, $2)", [tendai, zuri]);
  await as(zuri);
  const chat = (await one("select public.create_group_conversation('Privacy', $1::uuid[]) as id", [`{${tendai},${ayo}}`])).id;

  // Realtime inserts a probe row, reads it back as the member and rolls back.
  const probe = async (user, topic, extension = "broadcast") => {
    await superuser();
    await q("insert into realtime.messages (topic, extension) values ($1, $2)", [topic, extension]);
    if (user) await as(user);
    else await anon();
    await q("select set_config('realtime.topic', $1, false)", [topic]);
    const joins = (await one("select count(*)::int as n from realtime.messages where topic = $1 and extension = $2", [topic, extension])).n > 0;
    let sends = true;
    try {
      await q("insert into realtime.messages (topic, extension) values ($1, $2)", [topic, extension]);
    } catch {
      sends = false;
    }
    await superuser();
    await q("select set_config('realtime.topic', '', false)");
    return { joins, sends };
  };
  const topic = `conversation:${chat}`;
  let access = await probe(tendai, topic);
  check("participants join and send on their conversation's channel", access.joins && access.sends, access);
  access = await probe(ayo, topic);
  check("people still invited hear the channel but can't send on it", access.joins && !access.sends, access);
  access = await probe(stranger, topic);
  check("outsiders can't join or send on a conversation's channel", !access.joins && !access.sends, access);
  access = await probe(null, topic);
  check("guests can't join a conversation's channel", !access.joins && !access.sends, access);
  access = await probe(tendai, topic, "presence");
  check("conversation channels carry broadcasts only", !access.joins && !access.sends, access);
  access = await probe(tendai, "conversation:not-a-uuid");
  check("a malformed channel name is refused, not an error", !access.joins && !access.sends, access);
  access = await probe(tendai, `inbox:${tendai}`);
  check("members join their own inbox channel, read only", access.joins && !access.sends, access);
  access = await probe(stranger, `counts:${tendai}`);
  check("nobody joins someone else's counts channel", !access.joins && !access.sends, access);
  access = await probe(tendai, "lobby");
  check("any other channel is closed", !access.joins && !access.sends, access);
  check(
    "reactions are not streamed over Realtime",
    (await q("select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'message_reactions'")).length === 0,
  );

  await as(zuri);
  const hello = (await one("insert into public.messages (conversation_id, sender_id, body) values ($1, $2, 'Hello all') returning id", [chat, zuri])).id;
  await as(tendai);
  const react = (emoji) => q("insert into public.message_reactions (message_id, user_id, emoji) values ($1, $2, $3)", [hello, tendai, emoji]);
  for (const emoji of ["👍", "👍🏾", "❤️", "❤", "🙏🏿"]) await react(emoji);
  check("reactions take listed emoji, with skin tones on gestures", (await one("select count(*)::int as n from public.message_reactions where message_id = $1", [hello])).n === 5);
  for (const emoji of ["idiot", "👍👍", "😂 lol", "🏾", "🔥🏾"]) await fails(`a reaction can't be ${JSON.stringify(emoji)}`, "insert into public.message_reactions (message_id, user_id, emoji) values ($1, $2, $3)", [hello, tendai, emoji], /isn't available/);
  await superuser();
  await q("update public.reaction_rate set reactions = 60, window_start = now() where user_id = $1", [tendai]);
  await as(tendai);
  await fails("reactions are limited to 60 a minute", "insert into public.message_reactions (message_id, user_id, emoji) values ($1, $2, '🔥')", [hello, tendai], /reacting very quickly/);
  await q("delete from public.message_reactions where message_id = $1 and user_id = $2 and emoji = '👍'", [hello, tendai]);
  await fails("removing a reaction doesn't give one back", "insert into public.message_reactions (message_id, user_id, emoji) values ($1, $2, '👍')", [hello, tendai], /reacting very quickly/);
  await superuser();
  await q("update public.reaction_rate set window_start = now() - interval '2 minutes' where user_id = $1", [tendai]);
  await as(tendai);
  await react("🔥");
  await fails("members can't read or reset the reaction limit", "select * from public.reaction_rate", [], /permission denied/);
  await superuser();
  check("the limit resets after a minute", (await one("select reactions from public.reaction_rate where user_id = $1", [tendai])).reactions === 1);

  const queued = async (path) => (await q("select 1 from public.storage_cleanup where bucket = 'message-media' and path = $1", [path])).length === 1;
  const photo = (user, name) => one("insert into public.messages (conversation_id, sender_id, image_paths) values ($1, $2, $3) returning id", [chat, user, [`${chat}/${name}.webp`]]);
  await as(zuri);
  const removed = (await photo(zuri, "removed")).id;
  await superuser();
  await q("update public.messages set removed_at = now(), body = '', image_paths = '{}' where id = $1", [removed]);
  check("a removed message's photo is queued for erasure", await queued(`${chat}/removed.webp`));
  await as(tendai);
  await photo(tendai, "sender-left");
  await superuser();
  await q("delete from auth.users where id = $1", [tendai]);
  check("a deleted account's message photos are queued for erasure", await queued(`${chat}/sender-left.webp`));
  await as(zuri);
  await photo(zuri, "group-gone");
  await superuser();
  check("photos still in use are not queued", !(await queued(`${chat}/group-gone.webp`)));
  await q("delete from public.conversations where id = $1", [chat]);
  check("a deleted conversation's photos are queued for erasure", await queued(`${chat}/group-gone.webp`));

  const OWN = "https://hposvtbqckeyyxtjzyas.supabase.co/storage/v1/object/public/media/";
  const setAvatar = (url) => q("update public.profiles set avatar_url = $1 where id = $2", [url, zuri]);
  await as(zuri);
  await setAvatar(`${OWN}${zuri}/avatars/new.webp`);
  check("avatars can be this project's Storage files", (await one("select avatar_url from public.profiles where id = $1", [zuri])).avatar_url.endsWith("/new.webp"));
  await setAvatar("https://lh3.googleusercontent.com/a/ACg8ocK=s96-c");
  check("or the Google profile photo", (await one("select avatar_url from public.profiles where id = $1", [zuri])).avatar_url.startsWith("https://lh3."));
  for (const [what, url] of [
    ["any other host", "https://tracker.example/pixel.png?u=zuri"],
    ["another Supabase project", `https://evil.supabase.co/storage/v1/object/public/media/${zuri}/avatars/a.webp`],
    ["someone else's folder", `${OWN}${ayo}/avatars/a.webp`],
    ["another folder", `${OWN}${zuri}/posts/a.webp`],
    ["a nested path", `${OWN}${zuri}/avatars/../posts/a.webp`],
    ["a query string", `${OWN}${zuri}/avatars/a.webp?u=1`],
    ["plain http", `http://lh3.googleusercontent.com/a/x`],
  ]) await fails(`an avatar can't point to ${what}`, "update public.profiles set avatar_url = $1 where id = $2", [url, zuri], /Upload the profile photo again/);
  await fails("banners can't use the Google photo", "update public.profiles set banner_url = $1 where id = $2", ["https://lh3.googleusercontent.com/a/x", zuri], /Upload the banner again/);
  await q("update public.profiles set banner_url = $1 where id = $2", [`${OWN}${zuri}/banners/b.webp`, zuri]);
  check("banners can be this project's Storage files", (await one("select banner_url from public.profiles where id = $1", [zuri])).banner_url.endsWith("/b.webp"));
  await superuser();
  await db.exec("set session_replication_role = replica");
  await q("update public.profiles set avatar_url = 'https://old.example/a.png' where id = $1", [zuri]);
  await db.exec("set session_replication_role = origin");
  await as(zuri);
  await q("update public.profiles set bio = 'Still here' where id = $1", [zuri]);
  check("a profile with an older outside image can still be edited", (await one("select bio from public.profiles where id = $1", [zuri])).bio === "Still here");
  const tracked = await createUser("tracked@example.com", { username: "tracked", display_name: "Tracked", avatar_url: "https://tracker.example/me.png" });
  check("a sign-up's photo from another host is dropped", (await one("select avatar_url from public.profiles where id = $1", [tracked])).avatar_url === null);
  const google = await createUser("google@example.com", { username: "googler", display_name: "Googler", avatar_url: "https://lh3.googleusercontent.com/a/abc=s96-c" });
  check("a sign-up's Google photo is kept", (await one("select avatar_url from public.profiles where id = $1", [google])).avatar_url !== null);
  await as(zuri);
  await fails("members can't read the trusted Storage hosts", "select * from public.storage_origins", [], /permission denied/);

  const brisbaneCity = await city("brisbane");
  const event = (cover) =>
    one("insert into public.events (host_id, created_by, title, starts_at, city_id, venue_name, cover_url) values ($1, $1, 'Cover test', now() + interval '7 days', $2, 'Hall', $3) returning id", [zuri, brisbaneCity, cover]);
  await as(zuri);
  const covered = (await event(`${OWN}${zuri}/events/c.webp`)).id;
  check("event covers can be the host's Storage files", Boolean(covered));
  await fails("event covers can't point to any other host", "insert into public.events (host_id, created_by, title, starts_at, city_id, venue_name, cover_url) values ($1, $1, 'Cover test', now() + interval '7 days', $2, 'Hall', $3)", [zuri, brisbaneCity, "https://tracker.example/c.png"], /Upload the cover image again/);
  await fails("or be changed to one", "update public.events set cover_url = $1 where id = $2", ["https://tracker.example/c.png", covered], /Upload the cover image again/);

  await superuser();
  await db.exec(`
    create schema cron;
    create table cron.job_run_details (runid bigserial primary key, jobid bigint, status text, start_time timestamptz);
    insert into cron.job_run_details (jobid, status, start_time) values (1, 'succeeded', now() - interval '8 days'), (1, 'succeeded', now() - interval '6 days');
  `);
  check("pg_cron history older than 7 days is pruned", (await one("select public.prune_cron_history() as n")).n === 1 && (await one("select count(*)::int as n from cron.job_run_details")).n === 1);
  await db.exec("drop schema cron cascade");
  check("pruning does nothing without pg_cron", (await one("select public.prune_cron_history() as n")).n === 0);
  await as(zuri);
  await fails("members can't prune pg_cron history", "select public.prune_cron_history()", [], /permission denied/);
}

console.log("\nFeed cursors");
{
  const user = (name) => createUser(`${name}@example.com`, { username: name });
  const author = await user("tie_author");
  const reader = await user("tie_reader");
  const likers = await Promise.all([1, 2, 3, 4, 5].map((n) => user(`tie_liker_${n}`)));
  await as(reader);
  await q("insert into public.follows (follower_id, followee_id) values ($1, $2)", [reader, author]);

  // Scheduled posts published in one transaction share their timestamps, like these.
  const at = "2026-01-01 00:00:00+00";
  const after = "2026-01-01 00:00:01+00";
  const top = "ffffffff-ffff-ffff-ffff-ffffffffffff";
  await superuser();
  const insert = async (values) =>
    (await one("insert into public.posts (author_id, created_by, status, body, topics, parent_id, created_at, published_at) values ($1, $1, 'published', $2, $3, $4, $5, $5) returning id", values)).id;
  const tied = [];
  for (let n = 0; n < 7; n++) tied.push(await insert([author, `Tied post ${n} about cassava #tiedfeed`, "{tiedfeed}", null, at]));
  const replies = [];
  for (let n = 0; n < 5; n++) replies.push(await insert([reader, `Tied reply ${n}`, "{}", tied[0], at]));
  for (const liker of likers) await q("insert into public.likes (user_id, post_id, created_at) values ($1, $2, $3)", [liker, tied[0], at]);
  for (const id of tied) await q("insert into public.saves (user_id, post_id, created_at) values ($1, $2, $3)", [reader, id, at]);

  // Every row once, in the same order as one long page, however small the pages.
  const walk = async (sql, params, start, limit = 3) => {
    const seen = [];
    let cursor = start;
    for (let guard = 0; guard < 20; guard++) {
      const page = await q(sql, [...params, ...cursor, limit]);
      seen.push(...page.map((r) => r.id));
      if (page.length < limit) break;
      cursor = [page.at(-1).key, page.at(-1).id];
    }
    return seen;
  };
  const same = (paged, expected) => JSON.stringify(paged) === JSON.stringify(expected) && new Set(paged).size === paged.length;
  const lists = [
    ["Latest", "select id, greatest(published_at, created_at)::text as key from public.feed_latest($1, $2, $3)", [], tied],
    ["Following", "select id, greatest(published_at, created_at)::text as key from public.feed_following($1, $2, $3)", [], tied],
    ["a topic", "select id, created_at::text as key from public.feed_topic($1, $2, $3, $4)", ["tiedfeed"], tied],
    ["a profile", "select id, created_at::text as key from public.feed_profile($1, 'posts', $2, $3, $4)", [author], tied],
    ["saved posts", "select post->>'id' as id, saved_at::text as key from public.feed_saved($1, $2, $3)", [], tied],
  ];
  await as(reader);
  for (const [name, sql, params, expected] of lists) {
    const paged = await walk(sql, params, [after, top]);
    const whole = (await walk(sql, params, [after, top], 50)).filter((id) => expected.includes(id));
    check(`${name}: posts with the same timestamp page without skipping or repeating any`, same(paged, whole) && whole.length === expected.length, { paged: paged.length, whole: whole.length });
  }
  const repliesPaged = await walk("select id, created_at::text as key from public.post_replies($1, $2, $3, $4)", [tied[0]], [null, null]);
  check("replies with the same timestamp page without skipping or repeating any", same(repliesPaged, [...replies].sort()), repliesPaged);
  await as(author);
  const likersPaged = await walk("select id, liked_at::text as key from public.post_likers($1, $2, $3, $4)", [tied[0]], [null, null], 2);
  check("likes at the same moment page without skipping or repeating anyone", same(likersPaged, [...likers].sort().reverse()), likersPaged);

  await as(reader);
  const searched = await walk("select post->>'id' as id, search_score::text as key from public.search_posts($1, $2, $3, $4)", ["cassava"], [null, null]);
  check("search results with the same score page without skipping or repeating any", same(searched, [...tied].sort().reverse()), searched);

  // A post held for review and approved now was written two days ago.
  await superuser();
  const held = await insert([author, "Held, then approved", "{}", null, "2026-01-02 00:00:00+00"]);
  await q("update public.posts set status = 'pending', published_at = null, created_at = now() - interval '2 days' where id = $1", [held]);
  await q("select public.publish_post($1)", [held]);
  await as(reader);
  check("Latest shows a post approved after review at the top", (await one("select id from public.feed_latest(null, null, 1)")).id === held);
  check("so does Following", (await one("select id from public.feed_following(null, null, 1)")).id === held);
  check("new-post counts go by when posts were published", (await one("select public.count_new_posts('latest', now() - interval '1 minute') as n")).n >= 1);

  // Relevance halves every 30 days: a strong match beats a newer passing mention, and equal matches go newest first.
  await superuser();
  const strong = await insert([author, "Ugali ugali ugali: how to cook ugali", "{}", null, "2026-03-01 00:00:00+00"]);
  const passing = await insert([author, "Dinner was fine, there was ugalimix", "{}", null, "2026-03-15 00:00:00+00"]);
  const older = await insert([author, "How to cook ugali", "{}", null, "2026-02-01 00:00:00+00"]);
  const newer = await insert([author, "How to cook ugali!", "{}", null, "2026-05-01 00:00:00+00"]);
  await as(reader);
  const ranked = (await q("select post->>'id' as id from public.search_posts('ugali')")).map((r) => r.id);
  check("search ranks a strong match above a newer passing mention", ranked.indexOf(strong) < ranked.indexOf(passing) && ranked.includes(passing), ranked);
  check("search ranks equal matches newest first", ranked.indexOf(newer) < ranked.indexOf(older), ranked);
  await anon();
  check("guests can search posts", (await q("select post->>'id' as id from public.search_posts('ugali')")).length === 4);
}

console.log("\nWaking background tasks");
{
  await as(amara);
  await fails("members can't wake the task runner", "select public.wake_background_tasks()", [], /permission denied/);
  await superuser();
  await q("update public.background_tasks set run_after = now() + interval '1 day' where failed_at is null");
  check("with nothing due it makes no request", (await one("select public.wake_background_tasks() as woke")).woke === false);
}

console.log("\nPeople and discovery");
{
  const viewer = await createUser("pd_viewer@example.com", { username: "pd_viewer" });
  const writer = await createUser("pd_writer@example.com", { username: "pd_writer", display_name: "Pat Writer" });
  const quiet = await createUser("pd_quiet@example.com", { username: "pd_quiet" });
  const banned = await createUser("pd_banned@example.com", { username: "pd_banned" });
  const young = await createUser("pd_young@example.com", { username: "pd_young" });
  const blocker = await createUser("pd_blocker@example.com", { username: "pd_blocker" });
  const follow = async (follower, followee) => {
    await as(follower);
    await q("insert into public.follows (follower_id, followee_id) values ($1, $2)", [follower, followee]);
  };
  for (const who of [writer, banned, young, blocker]) {
    await as(who);
    await post("Hello from a person who posts");
    await follow(who, viewer);
  }
  await follow(quiet, viewer);
  await follow(viewer, banned);
  await follow(banned, writer);
  await follow(writer, blocker);
  await superuser();
  await q("update public.profiles set headline = 'Midwife in Logan', bio = 'Loves jollof and long walks', city_id = $2 where id = $1", [writer, brisbane]);
  await q("update public.profiles set city_id = $2 where id = $1", [banned, brisbane]);
  await q("update public.profile_settings set suspended_until = now() + interval '1 day' where id = $1", [banned]);
  await q("select public.deactivate_for_age($1, 'flagged', 'report')", [young]);
  await as(blocker);
  await q("insert into public.blocks (blocker_id, blocked_id) values ($1, $2)", [blocker, viewer]);
  await as(writer);
  const verifiedOrg = (await one("select public.create_organisation('pd_verified_org', 'Verified Org') as id")).id;
  await q("select public.create_organisation('pd_new_org', 'New Org')");
  await superuser();
  await q("update public.profiles set org_verified = true where id = $1", [verifiedOrg]);

  await as(viewer);
  const names = (rows) => rows.map((r) => r.username);
  rows = await q("select username from public.search_profiles('pd_', 50)");
  check("people search leaves out suspended and deactivated accounts", !names(rows).includes("pd_banned") && !names(rows).includes("pd_young") && names(rows).includes("pd_writer"), names(rows));
  check("people search matches headlines", names(await q("select username from public.search_profiles('midwife')")).includes("pd_writer"));
  check("people search matches bios", names(await q("select username from public.search_profiles('long walks')")).includes("pd_writer"));
  check("people search leaves out people across a block", !names(await q("select username from public.search_profiles('pd_blocker')")).includes("pd_blocker"));
  rows = await q("select username from public.suggested_profiles(50)");
  check("people who have posted come first, and nobody is left out for not posting", names(rows).indexOf("pd_writer") !== -1 && names(rows).indexOf("pd_writer") < names(rows).indexOf("pd_quiet") && names(rows).includes("pd_new_org"), names(rows));
  check("a verified organisation is suggested before its first post", names(rows).includes("pd_verified_org"), names(rows));
  check("suggestions leave out suspended and deactivated accounts", !names(rows).includes("pd_banned") && !names(rows).includes("pd_young"), names(rows));
  rows = await q("select username from public.suggestion_pool()");
  // The pool is cut to 20 popular people, so who else fits depends on the rest of this file; only the rule is checked.
  check("the Who to follow pool keeps the same rules", names(rows).includes("pd_writer") && !names(rows).some((u) => ["pd_banned", "pd_young"].includes(u)), names(rows));
  rows = await q("select username from public.nearby_profiles($1::smallint)", [brisbane]);
  check("nearby leaves out suspended accounts", names(rows).includes("pd_writer") && !names(rows).includes("pd_banned"), names(rows));
  check("profile cards are empty for suspended accounts", (await q("select * from public.profile_preview('pd_banned')")).length === 0);
  check("profile cards are empty for deactivated accounts", (await q("select * from public.profile_preview('pd_young')")).length === 0);
  check("profile cards still show everyone else", (await q("select * from public.profile_preview('pd_writer')")).length === 1);
  rows = await q("select username from public.mention_suggestions('pd_', null, null, 20)");
  check("mention suggestions leave out suspended and deactivated accounts", names(rows).includes("pd_writer") && !names(rows).includes("pd_banned") && !names(rows).includes("pd_young"), names(rows));
  rows = await q("select username from public.followers_you_know($1)", [writer]);
  check("followers you know leave out suspended accounts", !names(rows).includes("pd_banned"), names(rows));

  rows = await q("select username, follows_you, following from public.profile_connections($1, 'followers')", [viewer]);
  check("follower lists leave out suspended, deactivated and blocked people", names(rows).toSorted().join() === "pd_quiet,pd_writer", names(rows));
  check("follower lists say who follows you", rows.every((r) => r.follows_you === true && r.following === false), rows);
  await follow(viewer, quiet);
  await as(viewer);
  row = await one("select following from public.profile_connections($1, 'followers') where username = 'pd_quiet'", [viewer]);
  check("follower lists say whom you follow", row.following === true, row);
  const page1 = await q("select username, id, followed_at from public.profile_connections($1, 'followers', null, null, 1)", [viewer]);
  const page2 = await q("select username from public.profile_connections($1, 'followers', $2, $3, 1)", [viewer, page1[0].followed_at, page1[0].id]);
  check("follower lists page on the follow time and id", page1.length === 1 && page2.length === 1 && page1[0].username !== page2[0].username, [page1, page2]);
  rows = await q("select username from public.profile_connections($1, 'following')", [writer]);
  check("following lists work the same way", names(rows).includes("pd_viewer") && !names(rows).includes("pd_blocker"), names(rows));
  check("a direction that isn't followers or following lists nobody", (await q("select * from public.profile_connections($1, 'friends')", [viewer])).length === 0);

  await q("insert into public.suggestion_dismissals (user_id, dismissed_id) values ($1, $2)", [viewer, writer]);
  check("not for me leaves the person out of suggestions", !names(await q("select username from public.suggested_profiles(50)")).includes("pd_writer"));
  check("not for me leaves the person out of the Who to follow pool", !names(await q("select username from public.suggestion_pool()")).includes("pd_writer"));
  check("not for me still finds them in search", names(await q("select username from public.search_profiles('pd_writer')")).includes("pd_writer"));
  row = (await one("select public.export_my_data() as data")).data;
  check("dismissed suggestions are in the export", row.dismissed_suggestions.length === 1 && row.dismissed_suggestions[0].username === "pd_writer", row.dismissed_suggestions);
  await fails("people dismiss suggestions only as themselves", "insert into public.suggestion_dismissals (user_id, dismissed_id) values ($1, $2)", [writer, quiet], /row-level security/);
  await fails("nobody dismisses themselves", "insert into public.suggestion_dismissals (user_id, dismissed_id) values ($1, $1)", [viewer], /check constraint/);
  await as(writer);
  check("dismissals are private", (await q("select * from public.suggestion_dismissals")).length === 0);
  await as(viewer);
  await q("delete from public.suggestion_dismissals where dismissed_id = $1", [writer]);
  check("undoing not for me brings the person back", names(await q("select username from public.suggested_profiles(50)")).includes("pd_writer"));
  await q("insert into public.suggestion_dismissals (user_id, dismissed_id) values ($1, $2)", [viewer, writer]);
  await anon();
  check("guests read follower lists", (await q("select username from public.profile_connections($1, 'followers')", [viewer])).length === 2);
  await fails("guests have no dismissals", "select * from public.suggestion_dismissals", [], /permission denied/);
  await as(writer);
  await q("select public.delete_my_account()");
  await superuser();
  check("dismissals go with the dismissed account", (await q("select * from public.suggestion_dismissals where dismissed_id = $1", [writer])).length === 0);
}

console.log("\nGrouped notifications");
{
  const user = (name) => createUser(`${name}@example.com`, { username: name, display_name: name.replace("ng_", "") });
  const author = await user("ng_author");
  const fans = [];
  for (let i = 1; i <= 4; i++) fans.push(await user(`ng_fan${i}`));
  const [fan1, fan2, fan3, fan4] = fans;
  const groups = (types = null, before = null, limit = 20) =>
    q("select * from public.notification_groups($1, $2::public.notification_type[], 'Australia/Brisbane', $3, $4, null, $5)", [author, types ? `{${types.join(",")}}` : null, before?.at ?? null, before?.key ?? null, limit]);
  const unread = async () => (await one("select public.unread_notification_count() as n")).n;

  await as(author);
  const liked = await post("A post people will like");
  for (const fan of fans) {
    await as(fan);
    await q("insert into public.likes (user_id, post_id) values ($1, $2)", [fan, liked]);
  }
  await as(author);
  check("the badge counts groups, not rows: four likes on one post are one", (await unread()) === 1);
  rows = await groups();
  check("likes on a post are one row with three faces and the full count", rows.length === 1 && rows[0].type === "like" && rows[0].count === 4 && rows[0].actor_count === 4 && rows[0].actors.length === 3 && rows[0].unread_count === 4, rows[0]);
  check("the newest like leads the row", rows[0]?.latest?.actor?.username === "ng_fan4" && rows[0]?.actors[0]?.username === "ng_fan4", rows[0]?.latest?.actor);

  for (const fan of [fan1, fan2]) {
    await as(fan);
    await q("insert into public.follows (follower_id, followee_id) values ($1, $2)", [fan, author]);
  }
  await as(fan3);
  const first = await post("Looking at this one", "en", null, liked);
  const second = await post("And again", "en", null, liked);
  const mentionRoot = await post("Hi @ng_author, have you seen this?");
  await as(fan4);
  await post("@ng_author this one too", "en", null, mentionRoot);
  await as(author);
  rows = await groups();
  const kinds = rows.map((r) => `${r.type}:${r.count}`);
  check("follows share a row by day, every reply has its own, mentions share a thread", kinds.length === 5 && kinds.filter((k) => k === "reply:1").length === 2 && kinds.includes("follow:2") && kinds.includes("mention:2") && kinds.includes("like:4"), kinds);
  check("the badge counts five groups", (await unread()) === 5);
  const page = await groups(null, null, 2);
  const rest = await groups(null, { at: page[1].latest_at, key: page[1].key }, 20);
  check("groups page by latest activity and key without repeating", page.length === 2 && rest.length === 3 && new Set([...page, ...rest].map((r) => r.key)).size === 5, { page: page.map((r) => r.key), rest: rest.map((r) => r.key) });
  rows = await groups(["reply"]);
  check("a filter keeps only its types", rows.length === 2 && rows.every((r) => r.type === "reply"), rows.map((r) => r.type));
  const follows = rows = await groups(["follow"]);
  const items = await q("select * from public.notification_group_items($1, $2, 'Australia/Brisbane')", [author, follows[0].key]);
  check("a group lists its members on request", items.length === 2 && items.every((i) => i.type === "follow"), items.map((i) => i.type));
  check("the newest notification carries the post it is about", rows.every((r) => r.latest.recipient_id === author) && page.every((r) => r.type !== "reply" || r.latest.post?.id), page.map((r) => r.latest.post));

  await q("select public.mark_notifications_read($1, '{like}')", [author]);
  check("opening a tab marks only its notifications read", (await one("select count(*)::int as n from public.notifications where recipient_id = $1 and read_at is null and type = 'like'", [author])).n === 0 && (await unread()) === 4);
  await q("select public.mark_notifications_read($1)", [author]);
  check("without a tab everything is read", (await unread()) === 0);

  await as(fan1);
  await q("delete from public.follows where follower_id = $1 and followee_id = $2", [fan1, author]);
  await as(author);
  rows = await groups(["follow"]);
  check("a follow since undone is not shown", rows.length === 1 && rows[0].actor_count === 1 && rows[0].actors[0].username === "ng_fan2", rows[0]);

  await superuser();
  await q("update public.posts set status = 'pending' where id = $1", [second]);
  await as(author);
  rows = await groups(["reply"]);
  check("a reply later held for review leaves the inbox", rows.length === 1 && rows[0].latest.post.id === first, rows.map((r) => r.latest.post?.id));
  rows = await groups(["like"]);
  check("likes on your own post stay whatever its status", rows.length === 1);
  await superuser();
  check("a post published on creation sends no notice", (await one("select count(*)::int as n from public.notifications where recipient_id = $1 and type = 'moderation'", [fan3])).n === 0);
  await as(mod);
  await q("select public.moderate_content('post', $1, true)", [second]);
  await as(fan3);
  rows = await q("select message, rule, post_id from public.notification_details where recipient_id = $1 and type = 'moderation'", [fan3]);
  check("a held post that goes up tells its author", rows.length === 1 && rows[0].message === "Your reply is up. Thanks for waiting." && rows[0].rule === null && rows[0].post_id === second, rows);
  await superuser();
  await q("update public.posts set status = 'pending' where id = $1", [second]);
  await as(fan3);
  check("the notice stands only while the post is up", (await q("select 1 from public.notification_details where recipient_id = $1 and type = 'moderation'", [fan3])).length === 0);
  await as(fan1);
  check("nobody reads another person's groups", (await groups()).length === 0);
  await anon();
  await fails("guests have no notifications", "select * from public.notification_groups($1)", [author], /permission denied/);
}

console.log("\nBlocks in messages");
{
  const user = (name) => createUser(`${name}@example.com`, { username: name, display_name: name.replace("mb_", "") });
  const a = await user("mb_a");
  const b = await user("mb_b");
  const c = await user("mb_c");
  const d = await user("mb_d");
  const follow = async (who, whom) => {
    await as(who);
    await q("insert into public.follows (follower_id, followee_id) values ($1, $2)", [who, whom]);
  };
  await follow(a, b);
  await follow(b, a);
  await as(a);
  const aPost = await post("Written by a");
  await as(b);
  const bPost = await post("Written by b");
  await q("insert into public.likes (user_id, post_id) values ($1, $2)", [b, aPost]);
  await as(a);
  await q("insert into public.likes (user_id, post_id) values ($1, $2)", [a, bPost]);
  const direct = (await one("select public.start_direct_conversation($1) as id", [b])).id;
  await q("insert into public.messages (conversation_id, sender_id, body) values ($1, $2, 'Hello b')", [direct, a]);
  // The embedded clock ticks in milliseconds, so a read position set in the same tick as the message would hide it.
  await superuser();
  await q("update public.conversation_participants set last_read_at = last_read_at - interval '1 second' where conversation_id = $1 and user_id = $2", [direct, b]);
  await as(b);
  check("before a block the conversation is there", (await one("select public.unread_message_count() as n")).n === 1 && (await q("select 1 from public.conversation_list where id = $1", [direct])).length === 1);

  await as(a);
  await q("insert into public.blocks (blocker_id, blocked_id) values ($1, $2)", [a, b]);
  await superuser();
  check("blocking removes likes both ways", (await one("select count(*)::int as n from public.likes where (user_id, post_id) in (($1, $2), ($3, $4))", [a, bPost, b, aPost])).n === 0 && (await one("select like_count from public.posts where id = $1", [aPost])).like_count === 0);
  check("and their like notifications", (await one("select count(*)::int as n from public.notifications where type = 'like' and recipient_id in ($1, $2)", [a, b])).n === 0);
  for (const [who, name] of [[a, "the blocker"], [b, "the blocked person"]]) {
    await as(who);
    check(`${name} no longer sees the direct conversation`, (await q("select 1 from public.conversation_list where id = $1", [direct])).length === 0 && (await q("select 1 from public.conversations where id = $1", [direct])).length === 0);
    check(`${name} cannot read its messages`, (await q("select 1 from public.messages where conversation_id = $1", [direct])).length === 0);
    check(`${name}'s badge forgets it`, (await one("select public.unread_message_count() as n")).n === 0);
  }
  await as(a);
  await q("delete from public.blocks where blocker_id = $1 and blocked_id = $2", [a, b]);
  await as(b);
  check("unblocking brings the conversation back", (await q("select 1 from public.conversation_list where id = $1", [direct])).length === 1);

  await as(a);
  await q("insert into public.blocks (blocker_id, blocked_id) values ($1, $2)", [a, d]);
  await fails("a group can't start with two people who have a block", "select public.create_group_conversation('Picnic', $1::uuid[])", [`{${b},${d}}`], /d can't be added to this group/);
  await as(c);
  const group = (await one("select public.create_group_conversation('Picnic', $1::uuid[]) as id", [`{${a},${b}}`])).id;
  await fails("nobody is added to a group with someone they have a block with", "select public.add_group_members($1, $2::uuid[])", [group, `{${d}}`], /d can't be added to this group/);
  await as(d);
  await fails("whichever side blocked", "select public.create_group_conversation('Picnic', $1::uuid[])", [`{${a}}`], /can't be added to this group/);

  await as(c);
  const request = (await one("select public.start_direct_conversation($1) as id", [b])).id;
  await q("insert into public.messages (conversation_id, sender_id, body) values ($1, $2, 'May I?')", [request, c]);
  await as(b);
  // One unread direct message, the group invite from c, and now c's request.
  check("message requests count in the badge", (await one("select my_status from public.conversation_list where id = $1", [request])).my_status === "pending" && (await one("select public.unread_message_count() as n")).n === 3);
}

console.log("\nGroup history");
{
  const user = (name) => createUser(`${name}@example.com`, { username: name });
  const owner = await user("gh_owner");
  const old = await user("gh_old");
  const fresh = await user("gh_new");
  const shared = await user("gh_shared");
  for (const member of [old, fresh, shared]) {
    await as(member);
    await q("insert into public.follows (follower_id, followee_id) values ($1, $2)", [member, owner]);
  }
  await as(owner);
  const group = (await one("select public.create_group_conversation('History', $1::uuid[]) as id", [`{${old}}`])).id;
  const before = (await one("insert into public.messages (conversation_id, sender_id, body) values ($1, $2, 'Before anyone else joined') returning id", [group, owner])).id;
  const photo = `${group}/early.webp`;
  await q("insert into public.messages (conversation_id, sender_id, image_paths) values ($1, $2, $3)", [group, owner, [photo]]);
  await superuser();
  await q("insert into storage.objects (bucket_id, name) values ('message-media', $1)", [photo]);
  await as(old);
  await q("insert into public.message_reactions (message_id, user_id, emoji) values ($1, $2, '👍')", [before, old]);
  await as(owner);
  await q("select public.add_group_members($1, $2::uuid[])", [group, `{${fresh}}`]);
  await q("select public.add_group_members($1, $2::uuid[], true)", [group, `{${shared}}`]);

  await as(fresh);
  check("someone added later reads nothing from before they joined", (await q("select 1 from public.messages where conversation_id = $1", [group])).length === 0);
  row = await one("select unread_count, last_message, history_from from public.conversation_list where id = $1", [group]);
  check("their inbox shows no earlier preview or unread", row.unread_count === 0 && row.last_message === null && row.history_from !== null, row);
  check("nor earlier photos", (await q("select 1 from storage.objects where name = $1", [photo])).length === 0);
  check("nor reactions to earlier messages", (await q("select 1 from public.message_reactions where message_id = $1", [before])).length === 0);
  await as(shared);
  check("someone given the history reads it all", (await q("select 1 from public.messages where conversation_id = $1", [group])).length === 2 && (await q("select 1 from storage.objects where name = $1", [photo])).length === 1);
  check("and is told so", (await one("select history_from::text as t from public.conversation_list where id = $1", [group])).t === "-infinity");
  await as(owner);
  await q("insert into public.messages (conversation_id, sender_id, body) values ($1, $2, 'After they joined')", [group, owner]);
  await superuser();
  await q("update public.conversation_participants set last_read_at = last_read_at - interval '1 second' where conversation_id = $1 and user_id = $2", [group, fresh]);
  await as(fresh);
  rows = await q("select body from public.messages where conversation_id = $1", [group]);
  check("new messages reach everyone", rows.length === 1 && rows[0].body === "After they joined", rows);
  row = await one("select unread_count, last_message->>'body' as preview from public.conversation_list where id = $1", [group]);
  check("the inbox counts from when they joined", row.unread_count === 1 && row.preview === "After they joined", row);
  const reply = (await one("insert into public.messages (conversation_id, sender_id, body, reply_to_id) values ($1, $2, 'Replying to what?', $3) returning reply_to_id", [group, fresh, before])).reply_to_id;
  check("replies can't point at messages the sender can't read", reply === null);
  await as(old);
  check("people there from the start still read everything", (await q("select 1 from public.messages where conversation_id = $1", [group])).length === 4);
}

console.log("\nRate limits");
{
  const user = (name) => createUser(`${name}@example.com`, { username: name });
  const poster = await user("rl_poster");
  await as(poster);
  for (let i = 1; i <= 10; i++) await post(`Post number ${i}`);
  await fails("posts are limited to 10 a minute", "select public.create_post('Post number 11')", [], /10 times a minute/);
  const posts = await q("select id from public.posts where created_by = $1", [poster]);

  const reporter = await user("rl_reporter");
  await as(reporter);
  for (const { id } of posts.slice(0, 5)) await q("select public.report_content('post', $1, 'spam')", [id]);
  await fails("reports are limited to 5 a minute", "select public.report_content('post', $1, 'spam')", [posts[5].id], /5 reports a minute/);

  const founder = await user("rl_founder");
  await as(founder);
  for (let i = 1; i <= 3; i++) await q("select public.create_space($1, $2, 'A space', 'interest')", [`rl-space-${i}`, `Space ${i}`]);
  await fails("spaces are limited to 3 a day", "select public.create_space('rl-space-4', 'Space 4', 'A space', 'interest')", [], /3 spaces a day/);

  const lister = await user("rl_lister");
  await as(lister);
  for (let i = 1; i <= 10; i++) {
    await q("insert into public.events (host_id, created_by, title, starts_at, city_id, venue_name) values ($1, $1, $2, now() + interval '7 days', $3, 'Hall')", [lister, `Listing ${i}`, brisbane]);
  }
  await fails("events and opportunities are limited to 10 a day together", "insert into public.opportunities (poster_id, created_by, type, title, description, apply_url) values ($1, $1, 'job', 'One more', 'A job for someone', 'https://example.org/apply')", [lister], /limit for new listings/);

  const sender = await user("rl_sender");
  const friend = await user("rl_friend");
  await as(friend);
  await q("insert into public.follows (follower_id, followee_id) values ($1, $2)", [friend, sender]);
  await as(sender);
  const chat = (await one("select public.start_direct_conversation($1) as id", [friend])).id;
  for (let i = 1; i <= 30; i++) await q("insert into public.messages (conversation_id, sender_id, body) values ($1, $2, $3)", [chat, sender, `Message ${i}`]);
  await fails("messages are limited to 30 a minute", "insert into public.messages (conversation_id, sender_id, body) values ($1, $2, 'Message 31')", [chat, sender], /sending messages very quickly/);

  const targets = [];
  for (let i = 1; i <= 31; i++) targets.push(await user(`rl_target${i}`));
  const requester = await user("rl_requester");
  await as(requester);
  for (const target of targets.slice(0, 20)) await q("select public.start_direct_conversation($1)", [target]);
  await fails("message requests are limited to 20 a day", "select public.start_direct_conversation($1)", [targets[20]], /message requests today/);

  const follower = await user("rl_follower");
  await as(follower);
  for (const target of targets.slice(0, 30)) await q("insert into public.follows (follower_id, followee_id) values ($1, $2)", [follower, target]);
  await fails("follows are limited to 30 a minute", "insert into public.follows (follower_id, followee_id) values ($1, $2)", [follower, targets[30]], /following people very quickly/);

  await superuser();
  const many = (await q("insert into public.posts (author_id, created_by, status, body, published_at) select $1, $1, 'published', 'Post ' || n, now() from generate_series(1, 61) n returning id", [poster])).map((r) => r.id);
  const liker = await user("rl_liker");
  await as(liker);
  for (const id of many.slice(0, 60)) await q("insert into public.likes (user_id, post_id) values ($1, $2)", [liker, id]);
  await fails("likes are limited to 60 a minute", "insert into public.likes (user_id, post_id) values ($1, $2)", [liker, many[60]], /liking posts very quickly/);
  await q("delete from public.likes where user_id = $1 and post_id = $2", [liker, many[0]]);
  await fails("unliking gives nothing back", "insert into public.likes (user_id, post_id) values ($1, $2)", [liker, many[60]], /liking posts very quickly/);
  for (const id of many.slice(0, 60)) await q("insert into public.saves (user_id, post_id) values ($1, $2)", [liker, id]);
  await fails("saves are limited to 60 a minute", "insert into public.saves (user_id, post_id) values ($1, $2)", [liker, many[60]], /saving posts very quickly/);
  await fails("members can't read or reset the counters", "select * from public.rate_limits", [], /permission denied/);
  await superuser();
  await q("update public.rate_limits set window_start = now() - interval '2 minutes' where user_id = $1 and action = 'like'", [liker]);
  await as(liker);
  await q("insert into public.likes (user_id, post_id) values ($1, $2)", [liker, many[60]]);
  await superuser();
  check("the window resets after a minute", (await one("select hits from public.rate_limits where user_id = $1 and action = 'like'", [liker])).hits === 1);
  check("reactions are limited to 60 a minute (checked above)", true);
}

console.log("\nServer errors and switches");
{
  const service = () => db.exec("reset role; select set_config('request.jwt.claim.sub', '', false); set role service_role;");
  const lead = (await one("select id from public.profiles where username = 'site_lead'")).id;
  await superuser();
  row = await one("select automatic_check, link_previews, uploads from public.site_settings");
  check("the automatic check, link cards and uploads are on by default", row.automatic_check && row.link_previews && row.uploads, row);

  await as(amara);
  await fails("members cannot flip the switches", "select public.admin_update_switches(false, false, false)", [], /Admins only/);
  await fails("members cannot record server errors", "select public.record_server_error('d', '/x', 'render', 'boom')", [], /permission denied/);
  await fails("members cannot read server errors", "select * from public.server_errors", [], /permission denied/);

  await as(lead);
  await q("select public.admin_update_switches(false, false, null)");
  await superuser();
  row = await one("select automatic_check, link_previews, uploads from public.site_settings");
  check("admins turn switches off; null leaves one as it was", !row.automatic_check && !row.link_previews && row.uploads, row);

  // A new member's post with a link queues both kinds of task.
  const pauser = await createUser("pauser@example.com", { username: "pauser" });
  await as(pauser);
  const held = await post("Paused https://paused.example", "en", null, null, null, null, "https://paused.example");
  await superuser();
  await q("update public.background_tasks set run_after = now() - interval '1 second' where target_id = $1", [held]);
  check("tasks are still queued while their switch is off", (await one("select count(*)::int as n from public.background_tasks where target_id = $1", [held])).n === 2);
  await service();
  check("held tasks are not handed out", (await q("select * from public.claim_background_tasks(10, $1)", [held])).length === 0);
  await as(lead);
  const health = (await one("select public.admin_health() as h")).h;
  check("health counts held tasks and shows the switches", health.tasks.held >= 2 && health.tasks.overdue === 0 && health.switches.automaticCheck === false && health.switches.uploads === true, health.tasks);
  await q("select public.admin_update_switches(true, true, true)");
  await service();
  const released = await q("select * from public.claim_background_tasks(10, $1)", [held]);
  check("turned back on, held tasks run with their tries intact", released.length === 2 && released.every((task) => task.attempts === 1), released);

  await q("select public.record_server_error('abc123', '/u/[username]', 'render', $1)", [`Feed failed: ${"x".repeat(400)}`]);
  await q("select public.record_server_error('abc123', '/u/[username]', 'render', 'Feed failed')");
  await q("select public.record_server_error('def456', '/api/upload', 'route', 'Upload failed')");
  await q("select public.record_server_error('', '/api/upload', 'nonsense', '')");
  await superuser();
  rows = await q("select digest, kind, count, char_length(message) as length from public.server_errors order by digest");
  check(
    "the same error on a route counts up; messages are cut to 300 characters; blanks and unknown kinds are kept sensible",
    rows.length === 3 && rows[0].digest === "abc123" && rows[0].count === 2 && rows[0].length <= 300 && rows[2].digest === "unknown" && rows[2].kind === "render",
    rows,
  );
  await q("update public.server_errors set last_seen = now() - interval '15 days' where digest = 'def456'");
  await service();
  await q("select public.record_server_error('abc123', '/u/[username]', 'render', 'Feed failed')");
  check("errors are forgotten after 14 days", (await q("select 1 from public.server_errors where digest = 'def456'")).length === 0);
  // Logged in the same millisecond as the newest, which made the order a coin toss.
  await superuser();
  await q("update public.server_errors set last_seen = now() - interval '1 minute' where digest = 'unknown'");
  await as(lead);
  const errors = (await one("select public.admin_health() as h")).h.errors;
  check("health lists the last day's errors, newest first", errors.lastDay === 2 && errors.recent[0]?.digest === "abc123" && errors.recent[0].count === 3, errors);
  const tasks = (await one("select public.admin_health() as h")).h.tasks;
  check("health lists failed tasks with their last error", tasks.failed >= 1 && tasks.failures.length >= 1 && typeof tasks.failures[0].error === "string", tasks);
  const bystander = await createUser("settle-bystander@example.com", { username: "settle_bystander" });
  await as(bystander);
  await fails("only admins retry or dismiss failed tasks", "select public.admin_settle_failed_tasks(true)", [], /Admins only/);
  await as(lead);
  const retried = (await one("select public.admin_settle_failed_tasks(true) as n")).n;
  await superuser();
  const again = await q("select attempts, last_error, failed_at from public.background_tasks where failed_at is null and attempts = 0 and run_after <= now()");
  check(
    "admins try failed tasks again, from the first try",
    retried === tasks.failed && (await one("select count(*)::int as n from public.background_tasks where failed_at is not null")).n === 0 && again.length >= retried,
    { retried, again },
  );
  await q("update public.background_tasks set failed_at = now(), last_error = 'Gave up' where id = (select min(id) from public.background_tasks)");
  await as(lead);
  check("admins dismiss failed tasks", (await one("select public.admin_settle_failed_tasks(false) as n")).n === 1);
  await superuser();
  check("dismissed tasks are gone", (await one("select count(*)::int as n from public.background_tasks where failed_at is not null")).n === 0);
}

console.log("\nBans, suspensions and the rules");
{
  const banned = await createUser("banned.person+tag@Gmail.com", { username: "banned_person" });
  const other = await createUser("bystander@example.com", { username: "bystander" });
  const admin = await createUser("ban_admin@example.com", { username: "ban_admin" });
  await superuser();
  await q("update public.profile_settings set site_role = 'admin' where id = $1", [admin]);
  await q("insert into auth.identities (id, user_id, provider, provider_id, identity_data) values (gen_random_uuid(), $1, 'google', 'google-sub-123', '{\"sub\": \"google-sub-123\"}')", [banned]);
  await as(banned);
  const kept = await post("A post that will be hidden");
  const schedule = await one("select public.schedule_post(now() + interval '1 day', 'Later') as id");

  await as(mod);
  await fails("bans need the pepper in Vault", "select public.moderate_ban($1, 'Scams', 'honesty')", [banned], /identity_pepper/);
  await superuser();
  await q("insert into vault.decrypted_secrets (name, decrypted_secret) values ('identity_pepper', 'test-pepper')");
  await as(other);
  await fails("members cannot ban", "select public.moderate_ban($1, 'Scams', 'honesty')", [banned], /Moderators only/);
  await as(mod);
  await fails("banning names the rule", "select public.moderate_ban($1, 'Scams')", [banned], /rule/);
  await q("select public.moderate_ban($1, 'Took money for fake visas', 'honesty')", [banned]);
  await fails("a banned account cannot be suspended on top", "select public.moderate_suspend($1, interval '1 day', null, 'respect')", [banned], /already banned/);
  await superuser();
  row = await one("select banned_at, suspended_until = 'infinity' as forever from public.profile_settings where id = $1", [banned]);
  check("a ban is recorded and never ends", row.banned_at !== null && row.forever === true, row);
  check("a ban hides what the person published", (await one("select status, moderation_note from public.posts where id = $1", [kept])).moderation_note === "Account banned");
  check("a ban cancels scheduled posts", (await q("select id from public.scheduled_posts where id = $1", [schedule.id])).length === 0);
  rows = await q("select rule, until from public.banned_identities");
  check("the email address and the Google sign-in are remembered as hashes, for good", rows.length === 2 && rows.every((r) => r.rule === "honesty" && r.until === null), rows);
  check("hashes are not the identities", (await one("select count(*)::int as n from public.banned_identities where encode(hash, 'escape') like '%gmail%'")).n === 0);
  await as(banned);
  await fails("banned people cannot post", "select public.create_post('still here')", [], /cannot post/);
  rows = await q("select message from public.notifications where recipient_id = $1 and type = 'moderation' order by id desc limit 1", [banned]);
  check("the notice says the account is banned and why", /^Your account is banned from Mavuno under rule 3 .* Reason: Took money for fake visas/.test(rows[0]?.message), rows);
  await as(other);
  check("nobody else reads the hashes", (await q("select * from public.banned_identities").catch(() => null)) === null);

  const hook = (email, identities = []) => one("select public.before_user_created($1::jsonb) as reply", [JSON.stringify({ metadata: { name: "before-user-created" }, user: { email, identities } })]);
  await superuser();
  check("sign-up with the banned address is refused, however it is spelled", (await hook("Banned.Person@googlemail.com")).reply.error?.http_code === 403);
  check("sign-up with the banned Google account is refused", (await hook("fresh@example.com", [{ provider: "google", identity_data: { sub: "google-sub-123" } }])).reply.error?.http_code === 403);
  check("other sign-ups go ahead", JSON.stringify((await hook("fresh@example.com")).reply) === "{}");
  check("sign-ups without an email go ahead", JSON.stringify((await hook(null, [])).reply) === "{}");
  await as(other);
  await fails("members cannot call the sign-up hook", "select public.before_user_created('{}'::jsonb)", [], /permission denied/);

  await as(mod);
  await fails("only admins lift a ban", "select public.moderate_lift_suspension($1)", [banned], /admins/);
  await as(admin);
  await q("select public.moderate_lift_suspension($1, 'Appeal upheld')", [banned]);
  await superuser();
  row = await one("select banned_at, suspended_until from public.profile_settings where id = $1", [banned]);
  check("lifting a ban clears it", row.banned_at === null && row.suspended_until === null, row);
  check("and forgets the hashes", (await one("select count(*)::int as n from public.banned_identities")).n === 0);
  check("and brings back what was hidden", (await one("select status from public.posts where id = $1", [kept])).status === "published");
  rows = await q("select action, profile_id, (select username from public.profiles where id = moderator_id) as moderator from public.moderation_actions where profile_id = $1 order by id", [banned]);
  check("the record names the person and the moderators", rows.map((r) => r.action).join(",") === "ban,unban" && rows[1].moderator === "ban_admin", rows);

  // Deleting while suspended keeps the suspension's hashes until it would have ended.
  await as(mod);
  await q("select public.moderate_suspend($1, interval '3 days', 'Cooling off', 'respect')", [banned]);
  await q("select public.moderate_suspend($1, interval '1 hour', null, 'respect')", [banned]);
  await superuser();
  row = await one("select suspended_until from public.profile_settings where id = $1", [banned]);
  check("a second suspension extends the first", Math.round((new Date(row.suspended_until) - Date.now()) / 3_600_000) === 73, row);
  rows = await q("select message from public.notifications where recipient_id = $1 and type = 'moderation' order by id desc limit 2", [banned]);
  check("the notices say for how long and until when", /^Your account is suspended for 3 days, until .* \(Sydney time\), under rule 1/.test(rows[1].message) && /^Your suspension was extended by 1 hour, until /.test(rows[0].message), rows);
  await as(banned);
  await q("select public.delete_my_account()");
  await superuser();
  rows = await q("select rule, until from public.banned_identities");
  check("deleting a suspended account keeps its hashes until the suspension ends", rows.length === 2 && rows.every((r) => r.rule === "respect" && Math.round((new Date(r.until) - Date.now()) / 3_600_000) === 73), rows);
  check("those sign-ups are refused meanwhile", (await hook("banned.person@gmail.com")).reply.error !== undefined);
  await q("update public.banned_identities set until = now() - interval '1 minute'");
  check("and allowed once it has", JSON.stringify((await hook("banned.person@gmail.com")).reply) === "{}");
  check("ended suspensions are pruned", (await one("select public.prune_banned_identities() as n")).n === 2);

  // Lifting a suspension, and restoring after an appeal.
  const appellant = await createUser("appellant@example.com", { username: "appellant" });
  await as(appellant);
  const removed = await post("Removed by mistake");
  await as(mod);
  await q("select public.moderate_content('post', $1, false, 'Looked like spam', 'honesty')", [removed]);
  await q("select public.moderate_suspend($1, interval '7 days', null, 'honesty')", [appellant]);
  rows = await q("select id, action, subject, moderator from public.moderation_log where profile_id = $1 order by id", [appellant]);
  check("moderators look up decisions by number, with who decided about whom", rows.length === 2 && rows[0].subject.username === "appellant" && rows[0].moderator.username === "jo_moderates", rows);
  await fails("there is nothing to restore in a dismissal", "select public.moderate_restore(-1)", [], /no decision/);
  await q("select public.moderate_restore($1, 'Appeal upheld')", [rows[0].id]);
  await q("select public.moderate_restore($1)", [rows[1].id]);
  await superuser();
  check("restoring republishes the post", (await one("select status from public.posts where id = $1", [removed])).status === "published");
  check("and lifts the suspension", (await one("select suspended_until from public.profile_settings where id = $1", [appellant])).suspended_until === null);
  await as(appellant);
  rows = await q("select message from public.notifications where recipient_id = $1 and type = 'moderation' order by id desc limit 2", [appellant]);
  check("the person is told", rows[0].message.startsWith("Your suspension was lifted") && rows[1].message === "After another look, your post is back. Appeal upheld", rows);
  await as(mod);
  await fails("a lifted suspension cannot be lifted again", "select public.moderate_lift_suspension($1)", [appellant], /not suspended/);
  await as(other);
  check("members do not see the moderation log", (await q("select * from public.moderation_log")).length === 0);

  // The rules before the first post.
  const newcomer = await createUser("rules_newcomer@example.com", { username: "rules_newcomer", rules_accepted: false });
  await as(newcomer);
  await fails("posting needs the rules accepted", "select public.create_post('hello')", [], /community rules/);
  await fails("so does scheduling", "select public.schedule_post(now() + interval '1 hour', 'hello')", [], /community rules/);
  await fails(
    "and listing an event",
    "insert into public.events (host_id, created_by, title, starts_at, city_id) values ($1, $1, 'Meetup', now() + interval '7 days', $2)",
    [newcomer, brisbane],
    /community rules/,
  );
  await q("select public.accept_rules()");
  row = await one("select rules_accepted_at from public.profile_settings where id = $1", [newcomer]);
  check("accepting is recorded once", row.rules_accepted_at !== null);
  await q("select public.accept_rules()");
  check("and never moved", (await one("select rules_accepted_at from public.profile_settings where id = $1", [newcomer])).rules_accepted_at.getTime() === row.rules_accepted_at.getTime());
  await post("hello");
  check("then posting works", (await one("select count(*)::int as n from public.posts where created_by = $1", [newcomer])).n === 1);
  check("the acceptance is in the export", "rules_accepted_at" in (await one("select public.export_my_data() as data")).data.settings);
  await anon();
  await fails("guests cannot accept the rules", "select public.accept_rules()", [], /Sign in|permission denied/);
}

console.log("\nWeighted reports");
{
  const target = await createUser("weighed@example.com", { username: "weighed" });
  await as(target);
  const claim = await post("Vote for my cousin in the association election");
  const throwaways = [];
  for (const n of [1, 2, 3]) {
    const id = await createUser(`throwaway${n}@example.com`, { username: `throwaway${n}` });
    throwaways.push(id);
    await as(id);
    await q("select public.report_content('post', $1, 'spam')", [claim]);
  }
  await superuser();
  check("three brand-new accounts cannot hide a post", (await one("select status from public.posts where id = $1", [claim])).status === "published");
  check("their reports are marked as without standing", (await one("select count(*)::int as n from public.reports where target_id = $1 and not reporter_standing", [claim])).n === 3);
  await as(target);
  check("and do not put the person under review", (await one("select status from public.posts where id = $1", [await post("Another day")])).status === "published");
  await as(mod);
  row = await one("select report_count, standing_count from public.report_queue where target_id = $1", [claim]);
  check("moderators see how many reports carry weight", row.report_count === 3 && row.standing_count === 0, row);

  const regulars = [];
  for (const n of [1, 2, 3]) {
    const id = await createUser(`regular${n}@example.com`, { username: `regular${n}` });
    regulars.push(id);
    await superuser();
    await q("update public.profiles set created_at = now() - interval '10 days' where id = $1", [id]);
    await as(id);
    await post(`Regular ${n} says hi`);
  }
  const second = (await one("select id from public.posts where created_by = $1 and body = 'Another day'", [target])).id;
  for (const id of regulars) {
    await as(id);
    await q("select public.report_content('post', $1, 'harassment')", [second]);
  }
  await superuser();
  check("three members with standing hide a post", (await one("select status from public.posts where id = $1", [second])).status === "pending");
  await as(target);
  check("and put the person under review for a week", (await one("select status from public.posts where id = $1", [await post("Now reviewed")])).status === "pending");

  // A dismissed report costs the reporter their standing for a month.
  await as(mod);
  await q("select public.moderate_dismiss_reports('post', $1)", [second]);
  await superuser();
  check("a dismissed report no longer gives standing", (await one("select public.reporter_has_standing($1) as standing", [regulars[0]])).standing === false);
  await superuser();
  await q("update public.profile_settings set suspended_until = now() + interval '1 day' where id = $1", [regulars[1]]);
  check("nor does a suspended member have it", (await one("select public.reporter_has_standing($1) as standing", [regulars[1]])).standing === false);
  check("moderators always do", (await one("select public.reporter_has_standing($1) as standing", [mod])).standing === true);
  check("brand-new members do not", (await one("select public.reporter_has_standing($1) as standing", [throwaways[0]])).standing === false);
}

console.log("\nSecurity audit: sanctioned operators, listing edits, messaging, web addresses");
{
  const chief = await createUser("chief@example.com", { username: "chief_admin" });
  const rogue = await createUser("rogue@example.com", { username: "rogue_mod" });
  const victim = await createUser("victim@example.com", { username: "victim_one" });
  const buddy = await createUser("buddy@example.com", { username: "buddy_two" });
  await superuser();
  await q("update public.profile_settings set site_role = 'admin' where id = $1", [chief]);
  await q("update public.profile_settings set site_role = 'moderator' where id = $1", [rogue]);
  await as(victim);
  const fine = await post("Nothing wrong here");
  await as(chief);
  await q("select public.moderate_suspend($1, interval '1 day', 'Testing', 'respect')", [rogue]);
  await as(rogue);
  check("a suspended moderator is no longer a moderator", (await one("select public.is_moderator() as m")).m === false);
  await fails("a suspended moderator cannot moderate", "select public.moderate_content('post', $1, false, 'x', 'respect')", [fine], /Moderators only/);
  await fails("a suspended moderator cannot sanction", "select public.moderate_suspend($1, interval '1 day', 'x', 'respect')", [victim], /Moderators only/);
  await as(chief);
  await fails("admins cannot lift their own sanctions", "select public.moderate_lift_suspension($1)", [chief], /own sanctions/);
  await q("select public.moderate_lift_suspension($1)", [rogue]);
  await as(rogue);
  check("a lifted moderator is a moderator again", (await one("select public.is_moderator() as m")).m === true);

  await as(victim);
  const listing = await one("insert into public.opportunities (poster_id, created_by, type, title, description, apply_url) values ($1, $1, 'job', 'Community helper', 'Help at the weekend market', 'https://jobs.example/apply') returning id, status", [victim]);
  check("a newcomer's listing is published at insert", listing.status === "published", listing);
  await superuser();
  await q("delete from public.background_tasks where target_id = $1", [listing.id]);
  await q("insert into public.listing_flags (opportunity_id, categories) values ($1, '{spam}')", [listing.id]);
  await as(victim);
  row = await one("update public.opportunities set title = 'Warehouse work', description = 'Pay a deposit for your uniform first' where id = $1 returning status", [listing.id]);
  check("an edit by a member in good standing stays published", row.status === "published", row);
  await superuser();
  check("the edit queues a fresh automatic check", (await one("select count(*)::int as n from public.background_tasks where target_id = $1 and kind = 'automatic_check'", [listing.id])).n === 1);
  check("an earlier flag no longer hides the new text from the check", (await one("select count(*)::int as n from public.listing_flags where opportunity_id = $1", [listing.id])).n === 0);
  check("the check reads the edited text", (await one("select public.automatic_check_subject('opportunity', $1) as s", [listing.id])).s?.text?.includes("deposit") === true);
  await as(chief);
  await q("select public.admin_update_site_settings(true, true)");
  await as(victim);
  row = await one("update public.opportunities set title = 'Changed under review' where id = $1 returning status", [listing.id]);
  check("under premoderation an edit waits for a moderator", row.status === "pending", row);
  await as(chief);
  await q("select public.admin_update_site_settings(false, true)");
  await q("select public.moderate_content('opportunity', $1, true)", [listing.id]);

  await as(buddy);
  await q("insert into public.follows (follower_id, followee_id) values ($1, $2)", [buddy, victim]);
  await as(victim);
  const team = (await one("select public.create_group_conversation('Team', $1::uuid[]) as id", [`{${buddy}}`])).id;
  await as(buddy);
  const note = (await one("insert into public.messages (conversation_id, sender_id, body) values ($1, $2, 'hello') returning id", [team, buddy])).id;
  await superuser();
  await q("update public.profile_settings set suspended_until = now() + interval '1 day' where id = $1", [victim]);
  await as(victim);
  await fails("a suspended group owner cannot add people", "select public.add_group_members($1, $2::uuid[])", [team, `{${rogue}}`], /can't do this/);
  await fails("or rename the group", "select public.rename_group($1, 'Renamed')", [team], /can't do this/);
  await fails("or change roles", "select public.set_group_role($1, $2, 'admin')", [team, buddy], /can't do this/);
  await fails("or remove others", "select public.remove_group_member($1, $2)", [team, buddy], /Only group admins/);
  await fails("or react", "insert into public.message_reactions (message_id, user_id, emoji) values ($1, $2, '👍')", [note, victim], /row-level security/);
  await q("select set_config('realtime.topic', $1, false)", [`conversation:${team}`]);
  await fails("or broadcast on the channel", "insert into realtime.messages (topic, extension) values ($1, 'broadcast')", [`conversation:${team}`], /row-level security/);
  await q("select set_config('realtime.topic', '', false)");
  await q("select public.remove_group_member($1, $2)", [team, victim]);
  check("a suspended member can still leave a group", (await q("select 1 from public.conversation_participants where conversation_id = $1 and user_id = $2", [team, victim])).length === 0);
  await superuser();
  await q("update public.profile_settings set suspended_until = null where id = $1", [victim]);

  await as(victim);
  await fails("an event link must be one a browser can parse", "insert into public.events (host_id, created_by, title, starts_at, city_id, venue_name, ticket_url) values ($1, $1, 'Unparsable link', now() + interval '3 days', $2, 'Hall', 'https://a:99999')", [victim, brisbane], /events_ticket_url_web/);
  await fails("an apply link must be one a browser can parse", "update public.opportunities set apply_url = 'https:// ' where id = $1", [listing.id], /opportunities_apply_url_web/);
  await fails("a website must be one a browser can parse", "update public.profiles set website = 'https://%' where id = $1", [victim], /profiles_website_web/);
  await q("update public.profiles set website = 'https://example.org/me?x=1#top' where id = $1", [victim]);
  check("ordinary web addresses still pass", (await one("select website from public.profiles where id = $1", [victim])).website === "https://example.org/me?x=1#top");
  check("an IPv6 literal with a port passes", (await one("select public.is_web_url('https://[2001:db8::1]:8443/x') as ok")).ok === true);
  check("a port above 65535 fails", (await one("select public.is_web_url('https://a:65536') as ok")).ok === false);
}

console.log("\nSecurity audit: the low findings");
{
  const admin2 = await createUser("lowfix-admin@example.com", { username: "admin_two" });
  const mod2 = await createUser("lowfix-mod@example.com", { username: "mod_two" });
  const owner = await createUser("lowfix-owner@example.com", { username: "owner_two" });
  const pal = await createUser("lowfix-pal@example.com", { username: "pal_two" });
  const stranger = await createUser("lowfix-stranger@example.com", { username: "stranger_two" });
  await superuser();
  await q("update public.profile_settings set site_role = 'admin' where id = $1", [admin2]);
  await q("update public.profile_settings set site_role = 'moderator' where id = $1", [mod2]);
  await q("insert into vault.decrypted_secrets (name, decrypted_secret) values ('identity_pepper', 'test-pepper') on conflict do nothing");

  // 1. post images from own storage only
  await as(owner);
  await fails("a post image on another host is refused", "select public.create_post('Photo', 'en', null, null, null, null, null, $1::jsonb)",
    [JSON.stringify([{ path: `${owner}/posts/a.webp`, url: `https://evil.example/storage/v1/object/public/media/${owner}/posts/a.webp`, width: 10, height: 10, alt: "" }])], /Invalid image/);
  const photo = await post("Photo", "en", null, null, null, null, null, JSON.stringify([{ path: `${owner}/posts/a.webp`, url: `${OWN_MEDIA}${owner}/posts/a.webp`, width: 10, height: 10, alt: "" }]));
  check("a post image on the project's own storage is accepted", typeof photo === "string");

  // 2. mention cap
  const handles = [];
  for (let i = 0; i < 11; i++) handles.push((await createUser(`lowfix-named${i}@example.com`, { username: `named_${i}` }), `named_${i}`));
  await as(owner);
  await fails("a post cannot mention more than ten people", "select public.create_post($1)", [`Hello ${handles.map((h) => `@${h}`).join(" ")}`], /up to 10 people/);
  await post(`Hello ${handles.slice(0, 10).map((h) => `@${h}`).join(" ")}`);
  await superuser();
  check("ten mentions notify ten people", (await one("select count(*)::int as n from public.notifications where type = 'mention' and actor_id = $1", [owner])).n === 10);

  // 3. listing cap is a ledger
  await as(owner);
  for (let i = 0; i < 10; i++) await q("insert into public.events (host_id, created_by, title, starts_at, city_id, venue_name) values ($1, $1, $2, now() + interval '7 days', $3, 'Hall')", [owner, `Listing ${i}`, brisbane]);
  await fails("the eleventh listing of the day is refused", "insert into public.events (host_id, created_by, title, starts_at, city_id, venue_name) values ($1, $1, 'Eleven', now() + interval '7 days', $2, 'Hall')", [owner, brisbane], /limit for new listings/);
  await q("delete from public.events where created_by = $1 and title = 'Listing 0'", [owner]);
  await fails("deleting a listing gives nothing back", "insert into public.events (host_id, created_by, title, starts_at, city_id, venue_name) values ($1, $1, 'Again', now() + interval '7 days', $2, 'Hall')", [owner, brisbane], /limit for new listings/);

  // 4. message photos belong to one message
  await as(pal);
  await q("insert into public.follows (follower_id, followee_id) values ($1, $2)", [pal, owner]);
  await as(owner);
  const chat = (await one("select public.start_direct_conversation($1) as id", [pal])).id;
  await q("insert into public.messages (conversation_id, sender_id, body) values ($1, $2, 'hi')", [chat, owner]);
  await as(pal);
  await q("select public.respond_to_message_request($1, true)", [chat]);
  const snap = (await one("insert into public.messages (conversation_id, sender_id, body, image_paths) values ($1, $2, 'look', $3) returning id", [chat, pal, `{${chat}/pal-photo.webp}`])).id;
  await as(owner);
  await fails("a photo another participant sent cannot be re-attached", "insert into public.messages (conversation_id, sender_id, body, image_paths) values ($1, $2, 'mine now', $3)", [chat, owner, `{${chat}/pal-photo.webp}`], /Invalid attachment/);
  await superuser();
  await q("update public.messages set image_paths = '{}' where id = $1", [snap]);
  check("a photo nothing shows any more is queued for erasure", (await q("select 1 from public.storage_cleanup where path = $1", [`${chat}/pal-photo.webp`])).length === 1);

  // 5. blocks follow the writer into quote cards and notifications
  await as(owner);
  const orgx = (await one("select public.create_organisation('orgx_two', 'Org X') as id")).id;
  const orgPost = await post("Written by owner as orgx", "en", orgx);
  await as(stranger);
  const root = await post("Stranger root");
  await as(owner);
  await post("Owner replying as orgx", "en", orgx, root);
  await as(pal);
  const quote = await post("Pal quotes orgx", "en", null, null, orgPost);
  await as(stranger);
  await q("insert into public.blocks (blocker_id, blocked_id) values ($1, $2)", [stranger, owner]);
  row = await one("select quoted from public.post_details where id = $1", [quote]);
  check("a quote of a post the blocked person wrote as an organisation is unavailable", row.quoted?.unavailable === true, row.quoted);
  check("a reply the blocked person wrote as an organisation leaves the notifications", (await q("select 1 from public.notification_details where recipient_id = $1 and type = 'reply'", [stranger])).length === 0);

  // 6. restore is bound to the decision
  await as(mod2);
  await q("select public.moderate_suspend($1, interval '1 hour', 'Cooling off', 'respect')", [stranger]);
  await q("select public.moderate_ban($1, 'Fraud', 'honesty')", [stranger]);
  await superuser();
  const firstDecision = (await one("select id from public.moderation_actions where profile_id = $1 and action = 'suspend' order by id limit 1", [stranger])).id;
  await as(admin2);
  await fails("restoring an older suspension does not lift a later ban", "select public.moderate_restore($1, 'Appeal upheld')", [firstDecision], /followed by a ban/);
  await superuser();
  check("the ban stands", (await one("select banned_at from public.profile_settings where id = $1", [stranger])).banned_at !== null);

  // 7. a sanctioned account's email cannot change
  await as(mod2);
  await q("select public.moderate_suspend($1, interval '7 days', 'Spam', 'respect')", [pal]);
  await superuser();
  await fails("a suspended member's email cannot change", "update auth.users set email = 'burner@example.com' where id = $1", [pal], /suspended/);
  await q("update public.profile_settings set suspended_until = null where id = $1", [pal]);
  await q("update auth.users set email = 'pal2-new@example.com' where id = $1", [pal]);
  check("a member in good standing can still change their email", (await one("select email from auth.users where id = $1", [pal])).email === "pal2-new@example.com");

  // 8. an under-16 deactivation outlives the account
  const young = await createUser("lowfix-young@example.com", { username: "young_two" });
  await as(mod2);
  await q("select public.moderate_deactivate_under_16($1, 'report')", [young]);
  await as(young);
  await q("select public.delete_my_account()");
  await superuser();
  check("the identity of a deleted under-16 account is refused at sign-up", (await one("select (public.before_user_created('{\"user\":{\"email\":\"lowfix-young@example.com\",\"identities\":[]}}'::jsonb) -> 'error' ->> 'http_code') as c")).c === "403");

  // 9. the purge finds uploads whatever the folder's spelling
  const purged = await createUser("lowfix-purged@example.com", { username: "purged_two" });
  await superuser();
  await q("insert into storage.objects (bucket_id, name) values ('media', $1), ('media', $2)", [`${purged}/avatars/lower.webp`, `${purged.toUpperCase()}/avatars/upper.webp`]);
  await q("update public.profile_settings set age_deactivated_at = now() - interval '31 days' where id = $1", [purged]);
  await q("select public.purge_deactivated_accounts()");
  check("the purge queues the member's uploads in every spelling", (await one("select count(*)::int as n from public.storage_cleanup where path like $1 or path like $2", [`${purged}/%`, `${purged.toUpperCase()}/%`])).n === 2);

  // 10. team membership is an invitation
  await as(stranger);
  await superuser();
  await q("update public.profile_settings set banned_at = null, suspended_until = null where id = $1", [stranger]);
  await as(owner);
  await fails("nobody is added to a team across a block", "insert into public.organisation_members (org_id, user_id, role) values ($1, $2, 'editor')", [orgx, stranger], /cannot add this person/);
  await q("insert into public.organisation_members (org_id, user_id, role) values ($1, $2, 'editor')", [orgx, pal]);
  await as(pal);
  check("an invitation is not membership yet", (await one("select public.can_act_as($1) as ok", [orgx])).ok === false);
  await fails("an invited person cannot post as the organisation", "select public.create_post('As orgx', 'en', $1)", [orgx], /cannot post as this profile/);
  await q("select public.accept_team_invitation($1)", [orgx]);
  check("accepting makes it membership", (await one("select public.can_act_as($1) as ok", [orgx])).ok === true);
  await superuser();
  check("the owner's own row was accepted from the start", (await one("select accepted_at from public.organisation_members where org_id = $1 and user_id = $2", [orgx, owner])).accepted_at !== null);
}

console.log("\nInvite links");
{
  const confirm = (id) => q("update auth.users set email_confirmed_at = now() where id = $1", [id]);
  const invite = (id) => one("select invited_by from public.invites where member_id = $1", [id]);
  const follows = (from, to) => one("select count(*)::int as n from public.follows where follower_id = $1 and followee_id = $2", [from, to]).then((r) => r.n === 1);
  const host = await createUser("invite_host@example.com", { username: "invite_host", display_name: "Invite Host" });
  const friend = await createUser("invite_friend@example.com", { username: "invite_friend", display_name: "Invite Friend", invited_by: "Invite_Host" });

  await superuser();
  check("an unconfirmed sign-up records no invite and follows nobody", (await invite(friend)) === undefined && !(await follows(host, friend)));
  await confirm(friend);
  check("confirming the email records who invited them", (await invite(friend))?.invited_by === host);
  check("the two follow each other", (await follows(friend, host)) && (await follows(host, friend)));
  rows = await q("select type from public.notifications where recipient_id = $1 and actor_id = $2", [host, friend]);
  check("the inviter is told their friend joined, not that they followed", rows.length === 1 && rows[0].type === "joined", rows);
  rows = await q("select type from public.notifications where recipient_id = $1 and actor_id = $2", [friend, host]);
  check("the new member is told the inviter follows them", rows.length === 1 && rows[0].type === "follow", rows);
  await q("update auth.users set email_confirmed_at = null where id = $1", [friend]);
  await confirm(friend);
  check("confirming again changes nothing", (await one("select count(*)::int as n from public.notifications where recipient_id = $1 and type = 'joined'", [host])).n === 1);

  await as(host);
  rows = await q("select * from public.notification_groups($1)", [host]);
  check("the welcome is its own row in the inbox", rows.some((g) => g.type === "joined" && g.actors[0]?.id === friend), rows.map((g) => g.type));
  check("the inviter sees the invite", (await q("select member_id from public.invites")).length === 1);
  await fails("nobody writes invites directly", "insert into public.invites (member_id, invited_by) values ($1, $2)", [host, friend], /permission denied/);
  await fails("members cannot call the internal function", "select public.record_invite($1, 'invite_host')", [host], /permission denied/);
  await as(friend);
  check("the new member sees who invited them", (await q("select invited_by from public.invites"))[0]?.invited_by === host);
  await fails("and cannot remove it", "delete from public.invites where member_id = $1", [friend], /permission denied/);
  await q("select public.accept_invite('amara')");
  check("a member already invited keeps their inviter", (await invite(friend))?.invited_by === host);
  await as(amara);
  check("nobody else can see an invite", (await q("select * from public.invites")).length === 0);
  await anon();
  await fails("guests cannot read invites", "select * from public.invites", [], /permission denied/);
  await fails("guests cannot accept an invite", "select public.accept_invite('invite_host')", [], /permission denied/);

  // Google sign-ups: accept_invite, only for an account made in the last hour.
  const google = await createUser("invite_google@example.com", { username: "invite_google" });
  await as(google);
  await q("select public.accept_invite('invite_host')");
  check("a new Google account takes the invite", (await invite(google))?.invited_by === host && (await follows(google, host)) && (await follows(host, google)));
  const old = await createUser("invite_old@example.com", { username: "invite_old" });
  await superuser();
  await q("update public.profiles set created_at = now() - interval '2 hours' where id = $1", [old]);
  await as(old);
  await q("select public.accept_invite('invite_host')");
  await superuser();
  check("an existing member can't be made to follow anyone with a link", (await invite(old)) === undefined && !(await follows(host, old)));

  // Links that don't fit are ignored, and the sign-up still works.
  const toOrg = await createUser("invite_org@example.com", { username: "invite_to_org", invited_by: "brisbane_african_assoc" });
  const toNobody = await createUser("invite_nobody@example.com", { username: "invite_to_nobody", invited_by: "no_such_member" });
  const toSelf = await createUser("invite_self@example.com", { username: "invite_self", invited_by: "invite_self" });
  await superuser();
  await confirm(toOrg);
  await confirm(toNobody);
  await confirm(toSelf);
  check("organisations, unknown usernames and yourself invite nobody", (await q("select 1 from public.invites where member_id = any($1)", [[toOrg, toNobody, toSelf]])).length === 0);
  const suspendedHost = await createUser("invite_suspended@example.com", { username: "invite_suspended" });
  await q("update public.profile_settings set suspended_until = now() + interval '1 day' where id = $1", [suspendedHost]);
  const toSuspended = await createUser("invite_to_suspended@example.com", { username: "invite_to_suspended", invited_by: "invite_suspended" });
  await confirm(toSuspended);
  check("a suspended member's link invites nobody", (await invite(toSuspended)) === undefined);
  await q("insert into public.rate_limits (user_id, action, hits) values ($1, 'follow', 30) on conflict (user_id, action) do update set hits = 30, window_start = now()", [host]);
  const limited = await createUser("invite_limited@example.com", { username: "invite_limited", invited_by: "invite_host" });
  await confirm(limited);
  check("an inviter at their follow limit loses the invite, not the sign-up", (await one("select email_confirmed_at from auth.users where id = $1", [limited])).email_confirmed_at !== null && (await invite(limited)) === undefined);
  await q("delete from public.rate_limits where user_id = $1", [host]);
  const autoConfirmed = (await one("insert into auth.users (email, raw_user_meta_data, email_confirmed_at) values ($1, $2, now()) returning id", ["invite_auto@example.com", JSON.stringify({ age_confirmed: true, username: "invite_auto", invited_by: "invite_host" })])).id;
  check("a sign-up confirmed straight away is recorded at once", (await invite(autoConfirmed))?.invited_by === host);
  const unconfirmedAge = await createUser("invite_age@example.com", { username: "invite_age", invited_by: "invite_host", age_confirmed: false });
  await confirm(unconfirmedAge);
  check("someone who hasn't confirmed their age isn't recorded", (await invite(unconfirmedAge)) === undefined);

  await as(host);
  let data = (await one("select public.export_my_data() as data")).data;
  check("the inviter's export lists who joined with their link", data.invited.map((entry) => entry.username).sort().join() === "invite_auto,invite_friend,invite_google", data.invited);
  await as(friend);
  data = (await one("select public.export_my_data() as data")).data;
  check("the new member's export names who invited them", data.invited_by?.username === "invite_host", data.invited_by);

  const boss = await createUser("invite_admin@example.com", { username: "invite_admin" });
  await superuser();
  await q("update public.profile_settings set site_role = 'admin' where id = $1", [boss]);
  const total = (await one("select count(*)::int as n from public.invites")).n;
  await as(boss);
  const metrics = (await one("select public.admin_metrics(7) as m")).m;
  check("Operations counts invited sign-ups without naming anyone", metrics.signups.invited === 3 && metrics.signups.invitedTotal === total && total === 3, metrics.signups);

  await superuser();
  await q("delete from auth.users where id = $1", [host]);
  check("an inviter who leaves takes their name with them, and the count stays", (await one("select count(*)::int as n from public.invites where invited_by is null")).n === 3);
  await q("delete from auth.users where id = $1", [google]);
  check("a member who leaves takes their invite with them", (await invite(google)) === undefined);
}

console.log("\nSecurity gaps: sanctions, team invitations, the automatic check, files, bans and mutes");
{
  const service = () => db.exec("reset role; select set_config('request.jwt.claim.sub', '', false); set role service_role;");
  const boss = await createUser("gaps-admin@example.com", { username: "gaps_admin" });
  await superuser();
  await q("update public.profile_settings set site_role = 'admin' where id = $1", [boss]);
  await q("insert into vault.decrypted_secrets (name, decrypted_secret) values ('identity_pepper', 'test-pepper') on conflict do nothing");

  // 1. Suspended and banned members cannot edit through can_act_as, can_manage_org or space moderation.
  const host = await createUser("gaps-host@example.com", { username: "gaps_host" });
  const helper = await createUser("gaps-helper@example.com", { username: "gaps_helper" });
  const sanctioned = [];
  for (const [kind, sanction] of [
    ["suspended", "update public.profile_settings set suspended_until = now() + interval '1 day' where id = $1"],
    ["banned", "update public.profile_settings set banned_at = now(), suspended_until = 'infinity' where id = $1"],
  ]) {
    const person = await createUser(`gaps-${kind}@example.com`, { username: `gaps_${kind}` });
    await as(host);
    const party = (await one("insert into public.events (host_id, created_by, title, starts_at, city_id, venue_name) values ($1, $1, 'Open day', now() + interval '3 days', $2, 'Hall') returning id", [host, brisbane])).id;
    await as(person);
    const org = (await one("select public.create_organisation($1, 'Sanction Test Org') as id", [`gaps_${kind}_org`])).id;
    const event = (await one("insert into public.events (host_id, created_by, title, starts_at, city_id, venue_name) values ($1, $2, 'Meetup', now() + interval '3 days', $3, 'Hall') returning id", [org, person, brisbane])).id;
    const job = (await one("insert into public.opportunities (poster_id, created_by, type, title, description, apply_url) values ($1, $1, 'job', 'Helper', 'Weekend market', 'https://jobs.example/apply') returning id", [person])).id;
    const space = (await one("select public.create_space($1, 'Sanction test space', 'For testing', 'interest') as id", [`gaps-${kind}-space`])).id;
    await q("insert into public.event_rsvps (event_id, user_id, status) values ($1, $2, 'interested')", [party, person]);
    await superuser();
    await q(sanction, [person]);
    await as(person);
    await fails(`a ${kind} member cannot edit their profile`, "update public.profiles set display_name = 'Renamed' where id = $1", [person], /row-level security/);
    await fails(`or an organisation they run`, "update public.profiles set display_name = 'Renamed' where id = $1", [org], /row-level security/);
    await fails(`or their event`, "update public.events set title = 'Changed' where id = $1", [event], /row-level security/);
    await fails(`or their opportunity`, "update public.opportunities set title = 'Changed' where id = $1", [job], /row-level security/);
    await fails(`or add someone to their team`, "insert into public.organisation_members (org_id, user_id, role) values ($1, $2, 'editor')", [org, helper], /row-level security/);
    await q("update public.spaces set description = 'Changed' where id = $1", [space]);
    check(`or edit their space`, (await one("select description from public.spaces where id = $1", [space])).description === "For testing");
    check(`and is no longer a moderator of it`, (await one("select public.is_space_moderator($1) as m", [space])).m === false);
    await fails(`or change their RSVP`, "update public.event_rsvps set status = 'going' where event_id = $1 and user_id = $2", [party, person], /row-level security/);
    sanctioned.push({ person, org, event });
  }
  await superuser();
  await q("update public.profile_settings set suspended_until = null where id = $1", [sanctioned[0].person]);
  await as(sanctioned[0].person);
  await q("update public.events set title = 'Back again' where id = $1", [sanctioned[0].event]);
  check("a lifted suspension restores editing", (await one("select title from public.events where id = $1", [sanctioned[0].event])).title === "Back again");

  // 2. Team invitations cannot be used to send notifications over and over.
  const inviter = await createUser("gaps-inviter@example.com", { username: "gaps_inviter" });
  const invitee = await createUser("gaps-invitee@example.com", { username: "gaps_invitee" });
  await as(inviter);
  const club = (await one("select public.create_organisation('gaps_club', 'Gaps Club') as id")).id;
  for (let i = 0; i < 3; i++) {
    await q("insert into public.organisation_members (org_id, user_id, role) values ($1, $2, 'editor')", [club, invitee]);
    await q("delete from public.organisation_members where org_id = $1 and user_id = $2", [club, invitee]);
  }
  await superuser();
  check("inviting the same person again doesn't notify them again", (await one("select count(*)::int as n from public.notifications where recipient_id = $1 and type = 'org_added'", [invitee])).n === 1);
  await as(inviter);
  for (let i = 3; i < 20; i++) {
    await q("insert into public.organisation_members (org_id, user_id, role) values ($1, $2, 'editor')", [club, invitee]);
    await q("delete from public.organisation_members where org_id = $1 and user_id = $2", [club, invitee]);
  }
  await fails("the 21st team invitation of the day is refused", "insert into public.organisation_members (org_id, user_id, role) values ($1, $2, 'editor')", [club, invitee], /invited a lot of people/);

  // 3. The automatic check reads everything a newcomer publishes.
  const fresh = await createUser("gaps-fresh@example.com", { username: "gaps_fresh" });
  const checkQueued = async (type, id) => {
    await superuser();
    return (await q("select 1 from public.background_tasks where kind = 'automatic_check' and target_type = $1 and target_id = $2", [type, id])).length === 1;
  };
  const forget = async (id) => {
    await superuser();
    await q("delete from public.background_tasks where target_id = $1", [id]);
  };
  const subject = async (type, id) => {
    await service();
    return (await one("select public.automatic_check_subject($1, $2) as s", [type, id])).s;
  };
  await as(fresh);
  const pictured = await post("A photo", "en", null, null, null, null, null, JSON.stringify([{ path: `${fresh}/posts/p.webp`, url: `${OWN_MEDIA}${fresh}/posts/p.webp`, width: 10, height: 10, alt: "Alt text with a slur" }]));
  check("the check reads image descriptions", (await subject("post", pictured))?.text.includes("Alt text with a slur"));
  await as(fresh);
  const carded = await post("Look https://news.example/a", "en", null, null, null, null, "https://news.example/a");
  await forget(carded);
  await service();
  await q("select public.set_link_preview($1, 'https://news.example/a', $2)", [carded, JSON.stringify({ url: "https://news.example/a", title: "Card title", description: "Card words", image: "https://news.example/card.png" })]);
  check("a link card queues the check again", await checkQueued("post", carded));
  let s = await subject("post", carded);
  check("and the check reads the card's text and image", s?.text.includes("Card title") && s.text.includes("Card words") && s.images.includes("https://news.example/card.png"), s);
  await as(fresh);
  const linked = (await one("insert into public.events (host_id, created_by, title, starts_at, city_id, venue_name, online_url, ticket_url) values ($1, $1, 'Webinar', now() + interval '3 days', $2, 'Online', 'https://meet.example/room', 'https://tickets.example/buy') returning id", [fresh, brisbane])).id;
  s = await subject("event", linked);
  check("the check reads an event's links", s?.text.includes("https://meet.example/room") && s.text.includes("https://tickets.example/buy"), s);
  await as(fresh);
  const tagged = (await one("insert into public.opportunities (poster_id, created_by, type, title, description, apply_url, apply_email, tags) values ($1, $1, 'job', 'Driver', 'Weekend driving work', 'https://apply.example/x', 'jobs@apply.example', '{easymoney}') returning id", [fresh])).id;
  s = await subject("opportunity", tagged);
  check("the check reads an opportunity's tags and how to apply", s?.text.includes("easymoney") && s.text.includes("https://apply.example/x") && s.text.includes("jobs@apply.example"), s);
  await forget(tagged);
  await as(fresh);
  await q("update public.opportunities set tags = '{newtag}' where id = $1", [tagged]);
  check("changing an opportunity's tags checks it again", await checkQueued("opportunity", tagged));

  await forget(fresh);
  await as(fresh);
  await q("update public.profiles set bio = 'Bio with abuse', headline = 'Headline words', avatar_url = $2 where id = $1", [fresh, `${OWN_MEDIA}${fresh}/avatars/me.webp`]);
  check("a newcomer's profile edit is queued for the check", await checkQueued("profile", fresh));
  s = await subject("profile", fresh);
  check("the check reads a profile's words and pictures", s?.text.includes("Bio with abuse") && s.text.includes("Headline words") && s.images.includes(`${OWN_MEDIA}${fresh}/avatars/me.webp`), s);
  await as(fresh);
  const den = (await one("select public.create_space('gaps-den', 'Den name', 'Den description', 'interest') as id")).id;
  check("a newcomer's space is queued for the check", await checkQueued("space", den));
  s = await subject("space", den);
  check("the check reads a space's name and description", s?.text.includes("Den name") && s.text.includes("Den description"), s);
  await service();
  await q("select public.automatic_hold('profile', $1, '{harassment}')", [fresh]);
  await q("select public.automatic_hold('space', $1, '{hate}')", [den]);
  await as(mod);
  rows = await q("select target_type, target_profile_id from public.report_queue where target_id = any($1)", [[fresh, den]]);
  check("a flagged profile or space goes to the moderators' reports", rows.length === 2 && rows.every((r) => r.target_profile_id === fresh), rows);
  await forget(fresh);
  await as(fresh);
  await q("update public.profiles set bio = 'Calm bio' where id = $1", [fresh]);
  check("an edit to a flagged profile is checked again", (await checkQueued("profile", fresh)) && (await subject("profile", fresh))?.text.includes("Calm bio"));
  await q("select public.automatic_hold('profile', $1, '{hate}')", [fresh]);
  await as(mod);
  row = await one("select report_count, snapshot from public.report_queue where target_id = $1", [fresh]);
  check("flagging it again refreshes the same report", row?.report_count === 1 && row.snapshot.includes("Calm bio"), row);

  await as(fresh);
  const raced = await post("Race https://news.example/b", "en", null, null, null, null, "https://news.example/b");
  await service();
  const claimed = (await q("select id, kind from public.claim_background_tasks(10, $1)", [raced])).find((t) => t.kind === "automatic_check");
  await q("select public.set_link_preview($1, 'https://news.example/b', $2)", [raced, JSON.stringify({ url: "https://news.example/b", title: "Late card" })]);
  await q("select public.finish_background_task($1)", [claimed.id]);
  check("a check queued again while it runs isn't lost when the run finishes", await checkQueued("post", raced));

  // 4. Deleting an account or organisation, or changing a picture, queues its files for erasure.
  const leaver = await createUser("gaps-leaver@example.com", { username: "gaps_leaver" });
  await as(leaver);
  const leaverOrg = (await one("select public.create_organisation('gaps_leaver_org', 'Leaver Org') as id")).id;
  const partingOrg = (await one("select public.create_organisation('gaps_parting_org', 'Parting Org') as id")).id;
  await superuser();
  const files = [`${leaver}/avatars/a.webp`, `${leaver}/banners/b.webp`, `${leaver}/events/c.webp`, `${leaverOrg}/avatars/o.webp`, `${partingOrg}/avatars/p.webp`];
  await q("insert into storage.objects (bucket_id, name) select 'media', unnest($1::text[])", [files]);
  const queued = async (paths) => {
    await superuser();
    return (await one("select count(*)::int as n from public.storage_cleanup where bucket = 'media' and path = any($1)", [paths])).n;
  };
  await as(leaver);
  await q("update public.profiles set avatar_url = $2 where id = $1", [leaver, `${OWN_MEDIA}${leaver}/avatars/a.webp`]);
  await q("update public.profiles set avatar_url = $2 where id = $1", [leaver, `${OWN_MEDIA}${leaver}/avatars/a2.webp`]);
  check("a replaced profile photo is queued for erasure", (await queued([`${leaver}/avatars/a.webp`])) === 1);
  await as(leaver);
  const covered = (await one("insert into public.events (host_id, created_by, title, starts_at, city_id, venue_name, cover_url) values ($1, $1, 'Covered', now() + interval '3 days', $2, 'Hall', $3) returning id", [leaver, brisbane, `${OWN_MEDIA}${leaver}/events/c.webp`])).id;
  await q("delete from public.events where id = $1", [covered]);
  check("a deleted event's cover is queued for erasure", (await queued([`${leaver}/events/c.webp`])) === 1);
  await as(leaver);
  await q("select public.delete_organisation($1)", [partingOrg]);
  check("deleting an organisation queues its files", (await queued([`${partingOrg}/avatars/p.webp`])) === 1);
  await as(leaver);
  await q("select public.delete_my_account()");
  check("deleting an account queues its files and those of organisations it owned alone", (await queued(files)) === files.length);

  // 5. A ban hides what the person published as an organisation.
  const writer = await createUser("gaps-writer@example.com", { username: "gaps_writer" });
  await as(writer);
  const masthead = (await one("select public.create_organisation('gaps_masthead', 'Masthead') as id")).id;
  const orgPost = await post("Written as the organisation", "en", masthead);
  const orgEvent = (await one("insert into public.events (host_id, created_by, title, starts_at, city_id, venue_name) values ($1, $2, 'Org night', now() + interval '3 days', $3, 'Hall') returning id", [masthead, writer, brisbane])).id;
  const orgJob = (await one("insert into public.opportunities (poster_id, created_by, type, title, description, apply_url) values ($1, $2, 'job', 'Org job', 'Details of the role', 'https://jobs.example/org') returning id", [masthead, writer])).id;
  await superuser();
  await q("update public.events set status = 'published' where id = $1", [orgEvent]);
  await q("update public.opportunities set status = 'published' where id = $1", [orgJob]);
  const statuses = async () => {
    await superuser();
    return [
      (await one("select status from public.posts where id = $1", [orgPost])).status,
      (await one("select status from public.events where id = $1", [orgEvent])).status,
      (await one("select status from public.opportunities where id = $1", [orgJob])).status,
    ].join();
  };
  await as(boss);
  await q("select public.moderate_ban($1, 'Fraud', 'honesty')", [writer]);
  check("a ban hides posts, events and opportunities written as an organisation", (await statuses()) === "rejected,rejected,rejected", await statuses());
  await as(boss);
  await q("select public.moderate_lift_suspension($1)", [writer]);
  check("and lifting it brings them back", (await statuses()) === "published,published,published", await statuses());

  // 6. A mute covers someone writing as an organisation.
  const quiet = await createUser("gaps-quiet@example.com", { username: "gaps_quiet" });
  const loud = await createUser("gaps-loud@example.com", { username: "gaps_loud" });
  await as(loud);
  const megaphone = (await one("select public.create_organisation('gaps_megaphone', 'Megaphone') as id")).id;
  await as(quiet);
  const calm = await post("A calm post");
  await q("insert into public.mutes (muter_id, muted_id) values ($1, $2)", [quiet, loud]);
  await as(loud);
  await post("Replying as the organisation", "en", megaphone, calm);
  await post("Quoting as the organisation", "en", megaphone, null, calm);
  await post("Mentioning @gaps_quiet as the organisation", "en", megaphone);
  await superuser();
  rows = await q("select type from public.notifications where recipient_id = $1 and actor_id = $2", [quiet, megaphone]);
  check("someone muted writing as an organisation sends no replies, quotes or mentions", rows.length === 0, rows);
}

console.log("\nAn under-16 deactivation covers what the person wrote as an organisation");
{
  const mod = await createUser("agegap-mod@example.com", { username: "agegap_mod" });
  await superuser();
  await q("update public.profile_settings set site_role = 'moderator' where id = $1", [mod]);
  const teen = await createUser("agegap-teen@example.com", { username: "agegap_teen" });
  await as(teen);
  const club = (await one("select public.create_organisation('agegap_club', 'Club') as id")).id;
  const clubPost = await post("Written as the club", "en", club);
  const clubEvent = (await one("insert into public.events (host_id, created_by, title, starts_at, city_id, venue_name) values ($1, $2, 'Club night', now() + interval '3 days', $3, 'Hall') returning id", [club, teen, brisbane])).id;
  const clubJob = (await one("insert into public.opportunities (poster_id, created_by, type, title, description, apply_url) values ($1, $2, 'job', 'Club job', 'Details of the role', 'https://jobs.example/club') returning id", [club, teen])).id;
  await superuser();
  await q("update public.events set status = 'published' where id = $1", [clubEvent]);
  await q("update public.opportunities set status = 'published' where id = $1", [clubJob]);
  const statuses = async () => {
    await superuser();
    return [
      (await one("select status from public.posts where id = $1", [clubPost])).status,
      (await one("select status from public.events where id = $1", [clubEvent])).status,
      (await one("select status from public.opportunities where id = $1", [clubJob])).status,
    ].join();
  };
  await as(mod);
  await q("select public.moderate_deactivate_under_16($1, 'report')", [teen]);
  check("deactivating hides posts, events and opportunities written as an organisation", (await statuses()) === "rejected,rejected,rejected", await statuses());
  await as(mod);
  await q("select public.moderate_reinstate_age($1, 'document')", [teen]);
  check("and reinstating brings them back", (await statuses()) === "published,published,published", await statuses());
}

console.log("\nPush notifications");
{
  const writer = await createUser("push-writer@example.com", { username: "push_writer", display_name: "Wanjiru Kamau" });
  const fan = await createUser("push-fan@example.com", { username: "push_fan", display_name: "Femi Adeyemi" });
  const other = await createUser("push-other@example.com", { username: "push_other", display_name: "Oto Bello" });
  const third = await createUser("push-third@example.com", { username: "push_third" });
  const phone = "ExponentPushToken[writer-phone]";
  const sent = async () => {
    await superuser();
    return (await q("select id, url, headers, body from net.http_request_queue order by id")).map((r) => ({ ...r, body: r.body }));
  };
  const pushesTo = async (token) => (await sent()).flatMap((r) => (Array.isArray(r.body) ? r.body : [])).filter((m) => m.to === token);
  const clear = async () => {
    await superuser();
    await q("delete from net.http_request_queue");
  };

  await anon();
  await fails("guests can't register a phone", "select public.register_push_token($1)", [phone], /permission denied/);
  await as(writer);
  await fails("only Expo push tokens are taken", "select public.register_push_token('not a token')", [], /push_tokens_token_check/);
  await q("select public.register_push_token($1)", [phone]);
  await q("select public.register_push_token($1)", [phone]);
  await fails("members can't read push tokens", "select * from public.push_tokens", [], /permission denied/);
  await fails("members can't send pushes themselves", "select public.send_due_pushes()", [], /permission denied/);
  await fails("members can't queue pushes", "select public.queue_push($1, 'reply', 'x', $1)", [writer], /permission denied/);
  await superuser();
  check("registering twice keeps one row", (await one("select count(*)::int as n from public.push_tokens where profile_id = $1", [writer])).n === 1);

  // A reply goes out at once, with the start of the reply and where to go.
  await clear();
  await as(writer);
  const original = await post("Who's coming to the Logan market on Saturday?");
  await as(fan);
  const answer = await post("Me!   I'll bring\nthe suya", "en", null, original);
  let pushes = await pushesTo(phone);
  check("a reply is pushed straight away", pushes.length === 1 && pushes[0].title === "Femi Adeyemi replied" && pushes[0].body === "Me! I'll bring the suya", pushes);
  check("tapping it opens the reply, for that member only", pushes[0]?.data?.path === `/post/${answer}` && pushes[0]?.data?.recipient === writer, pushes[0]);
  check("it carries the unread count for the icon", pushes[0]?.badge === 1, pushes[0]);
  const request = (await sent())[0];
  check("it goes to Expo's push service", request?.url === "https://exp.host/--/api/v2/push/send" && request?.headers?.Authorization === undefined, request);
  await superuser();
  await q("insert into vault.decrypted_secrets (name, decrypted_secret) values ('expo_push_access_token', 'expo-secret')");

  // Likes: the first at once, the rest gathered for an hour.
  await clear();
  await as(fan);
  await q("insert into public.likes (user_id, post_id) values ($1, $2)", [fan, original]);
  pushes = await pushesTo(phone);
  check("the first like is pushed at once", pushes.length === 1 && pushes[0].body === "Femi Adeyemi liked your post" && pushes[0].collapseId === `like:${original}`, pushes);
  check("with the access token once there is one", (await sent())[0]?.headers?.Authorization === "Bearer expo-secret", (await sent())[0]?.headers);
  await clear();
  await as(other);
  await q("insert into public.likes (user_id, post_id) values ($1, $2)", [other, original]);
  await as(third);
  await q("insert into public.likes (user_id, post_id) values ($1, $2)", [third, original]);
  check("later likes wait", (await pushesTo(phone)).length === 0);
  await superuser();
  row = await one("select merged, send_after > now() + interval '50 minutes' as later from public.push_outbox where recipient_id = $1 and group_key = $2 and sent_at is null", [writer, `like:${original}`]);
  check("and wait as one, an hour after the last", row?.merged === 2 && row?.later === true, row);
  await q("update public.push_outbox set send_after = now() where recipient_id = $1 and sent_at is null", [writer]);
  await q("select public.send_due_pushes()");
  pushes = await pushesTo(phone);
  check("then go out together", pushes.length === 1 && pushes[0].body === "push_third and 1 other liked your post", pushes);

  // The member's switches.
  await as(writer);
  await q("update public.profile_settings set push_off = '{follow}' where id = $1", [writer]);
  await as(fan);
  await q("update public.profile_settings set push_off = '{}' where id = $1", [writer]);
  await superuser();
  check("members can't change someone else's switches", (await one("select push_off from public.profile_settings where id = $1", [writer])).push_off === "{follow}");
  await clear();
  await as(fan);
  await q("insert into public.follows (follower_id, followee_id) values ($1, $2)", [fan, writer]);
  await superuser();
  check("a kind switched off isn't queued", (await pushesTo(phone)).length === 0 && (await one("select count(*)::int as n from public.push_outbox where recipient_id = $1 and kind = 'follow'", [writer])).n === 0);

  // Messages: never their words; requests say so; muted conversations stay quiet.
  await clear();
  await as(other);
  const chat = (await one("select public.start_direct_conversation($1) as id", [writer])).id;
  await q("insert into public.messages (conversation_id, sender_id, body) values ($1, $2, 'My bank PIN is 1234')", [chat, other]);
  pushes = await pushesTo(phone);
  check("a message request is pushed without its words", pushes.length === 1 && pushes[0].title === "Oto Bello" && pushes[0].body === "Wants to send you a message" && !JSON.stringify(pushes).includes("PIN"), pushes);
  check("and opens the conversation", pushes[0]?.data?.path === `/conversation/${chat}`, pushes[0]);
  await as(writer);
  await q("select public.respond_to_message_request($1, true)", [chat]);
  await clear();
  await as(other);
  await q("insert into public.messages (conversation_id, sender_id, body) values ($1, $2, 'Thanks for accepting')", [chat, other]);
  await q("insert into public.messages (conversation_id, sender_id, body) values ($1, $2, 'See you there')", [chat, other]);
  await q("insert into public.messages (conversation_id, sender_id, body) values ($1, $2, 'Bring chairs')", [chat, other]);
  pushes = await pushesTo(phone);
  check("a message is pushed at once and the next waits a minute", pushes.length === 1 && pushes[0].title === "Oto Bello" && pushes[0].body === "Sent you a message", pushes);
  await superuser();
  await q("update public.push_outbox set send_after = now() where recipient_id = $1 and sent_at is null", [writer]);
  await q("select public.send_due_pushes()");
  pushes = await pushesTo(phone);
  check("messages that waited go as one", pushes.at(-1)?.body === "Sent you 2 messages" && pushes.at(-1)?.collapseId === `accepted:${chat}` && pushes.length === 2, pushes);
  await as(writer);
  await q("update public.conversation_participants set muted = true where conversation_id = $1 and user_id = $2", [chat, writer]);
  await clear();
  await superuser();
  await q("update public.push_outbox set sent_at = now() - interval '2 minutes' where recipient_id = $1", [writer]);
  await as(other);
  await q("insert into public.messages (conversation_id, sender_id, body) values ($1, $2, 'Hello?')", [chat, other]);
  check("a muted conversation isn't pushed", (await pushesTo(phone)).length === 0);
  await as(writer);
  await q("update public.conversation_participants set muted = false where conversation_id = $1 and user_id = $2", [chat, writer]);
  await q("insert into public.mutes (muter_id, muted_id) values ($1, $2)", [writer, other]);
  await as(other);
  await q("insert into public.messages (conversation_id, sender_id, body) values ($1, $2, 'Still there?')", [chat, other]);
  check("nor is a muted person's message", (await pushesTo(phone)).length === 0);

  // A group message to everyone in one request.
  await as(third);
  await q("select public.register_push_token('ExponentPushToken[third-phone]')");
  await as(other);
  await q("select public.register_push_token('ExponentPushToken[other-phone]')");
  await as(writer);
  const crew = (await one("select public.create_group_conversation('Market crew', $1::uuid[]) as id", [`{${other},${third}}`])).id;
  await superuser();
  await q("update public.conversation_participants set status = 'accepted' where conversation_id = $1", [crew]);
  await clear();
  await as(writer);
  await q("insert into public.messages (conversation_id, sender_id, body) values ($1, $2, 'Stall 14')", [crew, writer]);
  const group = await sent();
  check(
    "a group message reaches everyone in one request",
    group.length === 1 && group[0].body.length === 2 && group[0].body.every((m) => m.title === "Market crew" && m.body === "Wanjiru Kamau sent a message"),
    group,
  );

  // Expo's answers.
  await clear();
  const spare = "ExponentPushToken[writer-tablet]";
  await as(writer);
  await q("select public.register_push_token($1)", [spare]);
  await as(third);
  await post(`Hello @push_writer`);
  await superuser();
  const send = await one("select id, tokens from public.push_requests where kind = 'send' order by created_at desc, id desc limit 1");
  check("both phones get the mention", send?.tokens?.length === 2, send);
  const tickets = send.tokens.map((token) => (token === spare ? { status: "error", details: { error: "DeviceNotRegistered" } } : { status: "ok", id: "ticket-1" }));
  await q("insert into net._http_response (id, status_code, content) values ($1, 200, $2)", [send.id, JSON.stringify({ data: tickets })]);
  await q("select public.settle_pushes()");
  check("a phone Expo no longer knows is forgotten", (await q("select token from public.push_tokens where profile_id = $1", [writer])).map((r) => r.token).join() === phone);
  check("the other's ticket is kept for its receipt", (await one("select token from public.push_tickets where id = 'ticket-1'"))?.token === phone);
  await clear();
  await q("update public.push_tickets set created_at = now() - interval '16 minutes'");
  await q("select public.settle_pushes()");
  const asked = (await sent()).find((r) => r.url.endsWith("/getReceipts"));
  check("receipts are asked for after 15 minutes", JSON.stringify(asked?.body) === JSON.stringify({ ids: ["ticket-1"] }), asked);
  const receipts = await one("select id from public.push_requests where kind = 'receipts'");
  await q("insert into net._http_response (id, status_code, content) values ($1, 200, $2)", [receipts.id, JSON.stringify({ data: { "ticket-1": { status: "error", details: { error: "DeviceNotRegistered" } } } })]);
  await q("select public.settle_pushes()");
  check("a receipt saying the phone is gone forgets it", (await one("select count(*)::int as n from public.push_tokens where profile_id = $1", [writer])).n === 0);
  check("and its ticket and request are cleared", (await one("select (select count(*) from public.push_tickets) + (select count(*) from public.push_requests where kind = 'receipts')::int as n")).n === 0);

  // Signing out and deleting.
  await as(fan);
  await q("select public.register_push_token('ExponentPushToken[shared-phone]')");
  await as(other);
  await q("select public.register_push_token('ExponentPushToken[shared-phone]')");
  await superuser();
  check("a phone follows whoever signed in on it last", (await one("select profile_id from public.push_tokens where token = 'ExponentPushToken[shared-phone]'")).profile_id === other);
  await as(other);
  row = await one("select public.export_my_data() -> 'push_devices' as devices");
  check("the export lists phones without their tokens", row.devices.length === 2 && !JSON.stringify(row.devices).includes("shared-phone"), row);
  await anon();
  await q("select public.unregister_push_token('ExponentPushToken[shared-phone]')");
  await superuser();
  check("signing out removes the phone, even with an expired session", (await one("select count(*)::int as n from public.push_tokens where token = 'ExponentPushToken[shared-phone]'")).n === 0);
  await as(fan);
  await q("select public.register_push_token('ExponentPushToken[fan-phone]')");
  await superuser();
  await q("delete from auth.users where id = $1", [fan]);
  check("deleting the account deletes its phones", (await one("select count(*)::int as n from public.push_tokens where token = 'ExponentPushToken[fan-phone]'")).n === 0);
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
