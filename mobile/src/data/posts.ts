import { z } from "zod";
import { linkPreviewSchema, parsePeople, parsePostsLenient, parseReplyPreviews, postRowSchema, type LinkPreview, type PersonSummary, type Post, type PostRow, type ReplyPreviews, type ThreadPlace } from "@/lib/domain";
import { cursorOf, feedCall, feedPage, PAGE_SIZE, parseTimeCursor, THREAD_MAX_LENGTH, THREAD_PAGE_SIZE, type FeedSource } from "@/lib/feeds";
import { cardLink, mediaBucketUrl, pollArgument, postSchemas, type NewPost, type NewScheduledPost } from "@/lib/post-form";
import { done, fail, failFrom, ok, type Result } from "@/lib/result";
import { SCHEDULED_LIMIT, SCHEDULED_SELECT, scheduledRow, type ScheduledPost } from "@/lib/scheduled-posts";
import { routeError, runTasks, siteFetch } from "@/data/api";
import { env } from "@/data/env";
import { requestError } from "@/data/errors";
import { preferences } from "@/data/preferences";
import { supabase } from "@/data/supabase";

// The website's feed queries and post actions (src/lib/data/posts.ts and
// src/app/actions/posts.ts), against the same database functions, so row
// level security, mutes, blocks and rate limits apply the same.

export type { FeedSource } from "@/lib/feeds";
export type Page = { posts: PostRow[]; previews: ReplyPreviews; next: string | null };

const id = z.uuid();
export const MEDIA_URL = mediaBucketUrl(env.supabaseUrl);
const { newPost: newPostSchema, scheduled: scheduledPostSchema } = postSchemas(MEDIA_URL);

// A new draw of Trending for each visit; its later pages reuse it.
export const newTrendingSeed = () => Math.floor(Math.random() * 2 ** 47);

async function loadReplyPreviews(posts: PostRow[]): Promise<ReplyPreviews> {
  const limit = preferences().replyPreviews;
  const ids = posts.flatMap((post) => (post.kind === "post" && post.replies > 0 ? [post.id] : []));
  if (limit === 0 || ids.length === 0) return {};
  const { data, error } = await supabase.rpc("reply_previews", { p_post_ids: ids, p_limit: limit });
  if (error) throw requestError("Reply previews", error);
  return parseReplyPreviews(data, parsePostsLenient);
}

// Profiles and searches show posts on their own, as on the website.
const withPreviews = (source: FeedSource) => source.kind !== "profile" && source.kind !== "search";

export async function loadFeed(source: FeedSource, cursor: string | null): Promise<Page> {
  const { fn, args } = feedCall(source, cursor);
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw requestError(`Feed ${source.kind}`, error);
  const page = feedPage(source, data, parsePostsLenient);
  return { ...page, previews: withPreviews(source) ? await loadReplyPreviews(page.posts) : {} };
}

export async function loadReplies(postId: string, cursor: string | null) {
  const after = parseTimeCursor(cursor);
  const { data, error } = await supabase.rpc("post_replies", { p_post_id: postId, p_after: after?.key ?? null, p_after_id: after?.id ?? null, p_limit: PAGE_SIZE });
  if (error) throw requestError("Replies", error);
  const replies = parsePostsLenient(data);
  const last = replies.at(-1);
  return { replies, next: replies.length === PAGE_SIZE && last ? cursorOf(last.createdAt, last.id) : null };
}

export async function loadContinuation(postId: string) {
  const { data, error } = await supabase.rpc("post_continuation", { p_post_id: postId, p_limit: THREAD_PAGE_SIZE });
  if (error) throw requestError("Thread", error);
  return parsePostsLenient(data);
}

async function threadPosition(postId: string) {
  const { data, error } = await supabase.rpc("thread_position", { p_post_id: postId });
  if (error) throw requestError("Thread position", error);
  return z.number().int().positive().nullable().parse(data) ?? 1;
}

// The posts an author added under their own post, and where it sits among them.
export type Continuation = { kind: "none" } | { kind: "thread"; place: ThreadPlace; parts: PostRow[] };

async function loadContinuationOf(post: Post): Promise<Continuation> {
  if (post.authorMuted || (post.continuation === 0 && !post.parentId)) return { kind: "none" };
  const [parts, position] = await Promise.all([post.continuation > 0 ? loadContinuation(post.id) : [], post.parentId ? threadPosition(post.id) : 1]);
  const place = { position, size: position + Math.min(post.continuation, THREAD_MAX_LENGTH), capped: post.continuation > THREAD_MAX_LENGTH };
  return place.size > 1 ? { kind: "thread", place, parts } : { kind: "none" };
}

export type Thread = { kind: "missing" } | { kind: "thread"; post: Post; ancestors: PostRow[]; continuation: Continuation; replies: PostRow[]; next: string | null };

// One post as the viewer may see it, or null once it's gone.
export async function loadPost(postId: string): Promise<PostRow | null> {
  const { data, error } = await supabase.from("post_details").select("*").eq("id", postId).maybeSingle();
  if (error) throw requestError("Post", error);
  return data ? (postRowSchema.safeParse(data).data ?? null) : null;
}

// A post's page: what it answers, the post, the thread it continues, its replies.
export async function loadThread(postId: string): Promise<Thread> {
  const [row, ancestors] = await Promise.all([loadPost(postId), supabase.rpc("post_ancestors", { p_post_id: postId })]);
  if (ancestors.error) throw requestError("Ancestors", ancestors.error);
  if (!row || row.kind === "tombstone") return { kind: "missing" };
  const [{ replies, next }, continuation] = await Promise.all([loadReplies(postId, null), loadContinuationOf(row)]);
  return { kind: "thread", post: row, ancestors: parsePostsLenient(ancestors.data), continuation, replies, next };
}

export async function loadPinnedPost(postId: string | null) {
  if (!postId) return null;
  const post = await loadPost(postId).catch(() => null);
  return post?.kind === "post" && post.status === "published" ? post : null;
}

// Likes and saves are rows the viewer owns. Doing either twice is not an
// error, and neither is undoing what was never done.
async function toggle(table: "likes" | "saves", viewerId: string, postId: string, on: boolean): Promise<Result> {
  const row = { user_id: viewerId, post_id: id.parse(postId) };
  const { error } = on ? await supabase.from(table).upsert(row, { onConflict: "user_id,post_id", ignoreDuplicates: true }) : await supabase.from(table).delete().match(row);
  return error ? failFrom(error) : done;
}

export const setLike = (viewerId: string, postId: string, liked: boolean) => toggle("likes", viewerId, postId, liked);
export const setSaved = (viewerId: string, postId: string, saved: boolean) => toggle("saves", viewerId, postId, saved);

async function rpc(name: string, args: Record<string, unknown>): Promise<Result> {
  const { error } = await supabase.rpc(name, args);
  return error ? failFrom(error) : done;
}

// The database keeps a deleted post's content for 30 seconds, so Undo can bring it back.
export const deletePost = (postId: string) => rpc("delete_post", { p_post_id: id.parse(postId) });
export const restorePost = (postId: string) => rpc("restore_post", { p_post_id: id.parse(postId) });
export const pinPost = (postId: string) => rpc("pin_post", { p_post_id: id.parse(postId) });
export const unpinPost = (profileId: string) => rpc("unpin_post", { p_profile_id: id.parse(profileId) });
export const votePoll = (postId: string, optionId: string) => rpc("vote_poll", { p_post_id: id.parse(postId), p_option_id: id.parse(optionId) });

const LIKERS_PAGE = 30;
export type Likers = { people: PersonSummary[]; next: string | null };

// Who liked a post, newest first. The database only answers its author.
export async function loadLikers(postId: string, cursor: string | null): Promise<Likers> {
  const before = parseTimeCursor(cursor);
  const { data, error } = await supabase.rpc("post_likers", { p_post_id: postId, p_before: before?.key ?? null, p_before_id: before?.id ?? null, p_limit: LIKERS_PAGE });
  if (error) throw requestError("Likers", error);
  const last = z.array(z.object({ liked_at: z.string(), id: z.uuid() })).parse(data ?? []).at(-1);
  const people = parsePeople(data);
  return { people, next: people.length === LIKERS_PAGE && last ? cursorOf(last.liked_at, last.id) : null };
}

// The website's createPost: checked here first, then `create_post`, then the
// background tasks for its link card and automatic check.
export async function createPost(input: NewPost): Promise<Result<PostRow>> {
  const parsed = newPostSchema.safeParse(input);
  if (!parsed.success) return fail("Check your post and try again.");
  const post = parsed.data;
  const { data: postId, error } = await supabase.rpc("create_post", {
    p_body: post.body,
    p_language: post.language,
    p_author_id: post.authorId,
    p_parent_id: post.parentId,
    p_quote_id: post.quoteId,
    p_space_id: post.spaceId,
    p_link_url: cardLink(post.body, post.linkUrl),
    p_images: post.images,
    p_poll: pollArgument(post.poll),
    p_event_id: post.eventId,
    p_opportunity_id: post.opportunityId,
  });
  if (error) return failFrom(error);
  const created = id.parse(postId);
  runTasks(created);
  const row = await loadPost(created).catch(() => null);
  return row ? ok(row) : fail("Your post went up, but it couldn't be shown. Refresh to see it.");
}

export async function schedulePost(input: NewScheduledPost): Promise<Result> {
  const parsed = scheduledPostSchema.safeParse(input);
  if (!parsed.success) return fail("Check your post and try again.");
  const post = parsed.data;
  return rpc("schedule_post", {
    p_scheduled_at: post.scheduledAt,
    p_body: post.body,
    p_language: post.language,
    p_author_id: post.authorId,
    p_space_id: post.spaceId,
    p_link_url: cardLink(post.body, post.linkUrl),
    p_images: post.images,
    p_poll: pollArgument(post.poll),
  });
}

// The server fetches a new post's card after it is created; the composer
// waits for it a little, as the website does.
export async function loadLinkPreview(postId: string): Promise<LinkPreview | null> {
  const { data } = await supabase.from("posts").select("link_preview").eq("id", postId).maybeSingle();
  return z.object({ link_preview: linkPreviewSchema.nullable().catch(null) }).nullable().catch(null).parse(data)?.link_preview ?? null;
}

export async function loadScheduledPosts(): Promise<ScheduledPost[]> {
  const { data, error } = await supabase
    .from("scheduled_posts")
    .select(SCHEDULED_SELECT)
    .order("submitted_at", { ascending: false, nullsFirst: true })
    .order("scheduled_at")
    .limit(SCHEDULED_LIMIT);
  if (error) throw requestError("Scheduled posts", error);
  return z.array(scheduledRow).parse(data ?? []);
}

export async function cancelScheduledPost(scheduledId: string): Promise<Result> {
  const { data, error } = await supabase.from("scheduled_posts").delete().eq("id", id.parse(scheduledId)).select("id");
  if (error) return failFrom(error);
  return data.length > 0 ? done : fail("This post has already gone out. Refresh to see what happened.");
}

// Mentions suggest the people in the conversation first; the database orders them.
export async function mentionSuggestions(query: string, context: { replyTo: string | null; quoteOf: string | null }): Promise<PersonSummary[]> {
  const { data, error } = await supabase.rpc("mention_suggestions", { p_query: query, p_reply_to: context.replyTo, p_quote_of: context.quoteOf, p_limit: 6 });
  return error ? [] : parsePeople(data);
}

// The community rules are accepted once, before a member's first post.
export const acceptRules = () => rpc("accept_rules", {});

export type Translation = { kind: "translated"; text: string } | { kind: "elsewhere" } | { kind: "failed"; message: string };

// POST /api/translate. With no translation provider set up (501) the website
// opens Google Translate instead, and so does the app.
export async function translatePost(postId: string, target: string): Promise<Translation> {
  try {
    const response = await siteFetch("/api/translate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ postId, target }) });
    if (response.status === 501) return { kind: "elsewhere" };
    if (response.status === 429) return { kind: "failed", message: "Too many translations at once. Try again in a minute." };
    if (!response.ok) return { kind: "failed", message: await routeError(response, "This post couldn't be translated.") };
    const body = z.object({ text: z.string() }).safeParse(await response.json());
    return body.success ? { kind: "translated", text: body.data.text } : { kind: "failed", message: "This post couldn't be translated." };
  } catch {
    return { kind: "failed", message: "Couldn't reach Mavuno. Check your connection and try again." };
  }
}
