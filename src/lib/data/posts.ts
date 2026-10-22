import "server-only";
import { randomInt } from "node:crypto";
import { cookies } from "next/headers";
import { cache } from "react";
import { z } from "zod";
import { parsePeople, parsePosts, parseReplyPreviews, postRowSchema, type PersonSummary, type Post, type PostRow, type ReplyPreviews, type ThreadPlace } from "@/lib/domain";
import { cursorOf, feedTime, PAGE_SIZE, parseTimeCursor, splitCursor, THREAD_MAX_LENGTH, THREAD_PAGE_SIZE, type FeedSource } from "@/lib/feeds";
import { parseReplyPreviewCount, REPLY_PREVIEWS_COOKIE } from "@/lib/reply-previews";
import { createClient } from "@/lib/supabase/server";

export type FeedPage = { posts: PostRow[]; previews: ReplyPreviews; next: string | null };

// A new draw of Trending for each visit.
export const newTrendingSeed = () => randomInt(0, 2 ** 47);

// The posts that continue a post on its page, and the post's own place in that thread.
export type Continuation = { kind: "none" } | { kind: "thread"; place: ThreadPlace; parts: PostRow[] };

const savedRows = z.array(z.object({ saved_at: z.string(), post: z.unknown() }));
const score = z.union([z.number(), z.string()]).transform(String);
const trendingRows = z.array(z.object({ trending_score: score, post: z.unknown() }).transform((row) => ({ score: row.trending_score, post: row.post })));
const searchRows = z.array(z.object({ search_score: score, post: z.unknown() }).transform((row) => ({ score: row.search_score, post: row.post })));

// Trending and search page after a score.
const scoreCursor = z
  .string()
  .regex(/^-?\d+(\.\d+)?:[0-9a-f-]{36}$/)
  .transform(splitCursor)
  .pipe(z.object({ key: z.string(), id: z.uuid() }));

async function query(source: FeedSource, cursor: string | null) {
  const supabase = await createClient();
  const byTime = () => {
    const after = parseTimeCursor(cursor);
    return { p_before: after?.key ?? null, p_before_id: after?.id ?? null, p_limit: PAGE_SIZE };
  };
  const byScore = () => {
    const after = cursor ? scoreCursor.parse(cursor) : null;
    return { p_after_score: after?.key ?? null, p_after_id: after?.id ?? null, p_limit: PAGE_SIZE };
  };
  switch (source.kind) {
    case "following":
      return supabase.rpc("feed_following", byTime());
    case "latest":
      return supabase.rpc("feed_latest", byTime());
    case "trending":
      return supabase.rpc("feed_trending", { p_seed: source.seed, ...byScore() });
    case "saved":
      return supabase.rpc("feed_saved", byTime());
    case "space":
      return supabase.rpc("feed_space", { p_space_id: source.spaceId, ...byTime() });
    case "topic":
      return supabase.rpc("feed_topic", { p_topic: source.topic, ...byTime() });
    case "profile":
      return supabase.rpc("feed_profile", { p_profile_id: source.profileId, p_kind: source.tab, ...byTime() });
    case "local":
      return supabase.rpc("feed_local", { p_city_id: source.cityId, p_radius_km: source.radiusKm, ...byTime() });
    case "search":
      return supabase.rpc("search_posts", { p_query: source.query, ...byScore() });
    default: {
      const exhaustive: never = source;
      return exhaustive;
    }
  }
}

async function readPage(source: FeedSource, cursor: string | null): Promise<Omit<FeedPage, "previews">> {
  const { data, error } = await query(source, cursor);
  if (error) throw new Error(`Feed ${source.kind} failed: ${error.message}`);

  switch (source.kind) {
    case "saved": {
      const rows = savedRows.parse(data);
      const posts = parsePosts(rows.map((row) => row.post));
      const last = rows.at(-1);
      const lastPost = posts.at(-1);
      return { posts, next: rows.length === PAGE_SIZE && last && lastPost ? cursorOf(last.saved_at, lastPost.id) : null };
    }
    case "trending":
    case "search": {
      const rows = (source.kind === "trending" ? trendingRows : searchRows).parse(data);
      const posts = parsePosts(rows.map((row) => row.post));
      const last = rows.at(-1);
      const lastPost = posts.at(-1);
      return { posts, next: rows.length === PAGE_SIZE && last && lastPost ? cursorOf(last.score, lastPost.id) : null };
    }
    case "following":
    case "latest":
    case "space":
    case "topic":
    case "profile":
    case "local": {
      const posts = parsePosts(data);
      const last = posts.at(-1);
      if (posts.length < PAGE_SIZE || !last) return { posts, next: null };
      return { posts, next: cursorOf(source.kind === "following" || source.kind === "latest" ? feedTime(last) : last.createdAt, last.id) };
    }
    default: {
      const exhaustive: never = source;
      return exhaustive;
    }
  }
}

// The newest replies to every post on a page, in one query.
async function loadReplyPreviews(posts: PostRow[]): Promise<ReplyPreviews> {
  const count = parseReplyPreviewCount((await cookies()).get(REPLY_PREVIEWS_COOKIE)?.value);
  const ids = posts.flatMap((post) => (post.kind === "post" && post.replies > 0 ? [post.id] : []));
  if (count === 0 || ids.length === 0) return {};
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("reply_previews", { p_post_ids: ids, p_limit: count });
  if (error) throw new Error(`Reply previews failed: ${error.message}`);
  return parseReplyPreviews(data);
}

export async function loadFeed(source: FeedSource, cursor: string | null = null, { previews = true } = {}): Promise<FeedPage> {
  const page = await readPage(source, cursor);
  return { ...page, previews: previews ? await loadReplyPreviews(page.posts) : {} };
}

export async function loadReplies(postId: string, cursor: string | null = null) {
  const supabase = await createClient();
  const after = parseTimeCursor(cursor);
  const { data, error } = await supabase.rpc("post_replies", { p_post_id: postId, p_after: after?.key ?? null, p_after_id: after?.id ?? null, p_limit: PAGE_SIZE });
  if (error) throw new Error(`Replies failed: ${error.message}`);
  const replies = parsePosts(data);
  const last = replies.at(-1);
  return { replies, next: replies.length === PAGE_SIZE && last ? cursorOf(last.createdAt, last.id) : null };
}

export async function loadContinuation(postId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("post_continuation", { p_post_id: postId, p_limit: THREAD_PAGE_SIZE });
  if (error) throw new Error(`Thread failed: ${error.message}`);
  return parsePosts(data);
}

async function threadPosition(postId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("thread_position", { p_post_id: postId });
  if (error) throw new Error(`Thread position failed: ${error.message}`);
  return z.number().int().positive().nullable().parse(data) ?? 1;
}

async function loadContinuationOf(post: Post): Promise<Continuation> {
  if (post.authorMuted || (post.continuation === 0 && !post.parentId)) return { kind: "none" };
  const [parts, position] = await Promise.all([post.continuation > 0 ? loadContinuation(post.id) : [], post.parentId ? threadPosition(post.id) : 1]);
  const place = { position, size: position + Math.min(post.continuation, THREAD_MAX_LENGTH), capped: post.continuation > THREAD_MAX_LENGTH };
  return place.size > 1 ? { kind: "thread", place, parts } : { kind: "none" };
}

// A published post as a guest sees it, for its share image.
export async function loadPublicPost(postId: string): Promise<Post | null> {
  if (!z.uuid().safeParse(postId).success) return null;
  const supabase = await createClient();
  const { data } = await supabase.from("post_details").select("*").eq("id", postId).maybeSingle();
  const row = data ? postRowSchema.parse(data) : null;
  return row?.kind === "post" && row.status === "published" ? row : null;
}

// Cached per request: the page and its metadata both ask for the same thread.
export const loadThread = cache(async (postId: string) => {
  const supabase = await createClient();
  const [{ data: row }, { data: ancestors }] = await Promise.all([
    supabase.from("post_details").select("*").eq("id", postId).maybeSingle(),
    supabase.rpc("post_ancestors", { p_post_id: postId }),
  ]);
  if (!row) return null;
  const post = postRowSchema.parse(row);
  if (post.kind === "tombstone") return null;
  const [{ replies, next }, continuation] = await Promise.all([loadReplies(postId), loadContinuationOf(post)]);
  return { post, ancestors: parsePosts(ancestors), continuation, replies, next };
});

const LIKERS_PAGE = 30;

export type Likers = { people: PersonSummary[]; next: string | null };

// Who liked a post, newest first. The database only answers its author.
export async function loadLikers(postId: string, cursor: string | null): Promise<Likers> {
  const supabase = await createClient();
  const before = parseTimeCursor(cursor);
  const { data, error } = await supabase.rpc("post_likers", { p_post_id: postId, p_before: before?.key ?? null, p_before_id: before?.id ?? null, p_limit: LIKERS_PAGE });
  if (error) throw new Error(`Likers failed: ${error.message}`);
  const last = z.array(z.object({ liked_at: z.string(), id: z.uuid() })).parse(data ?? []).at(-1);
  const people = parsePeople(data);
  return { people, next: people.length === LIKERS_PAGE && last ? cursorOf(last.liked_at, last.id) : null };
}

export async function countNewPosts(feed: "following" | "latest", since: string) {
  const supabase = await createClient();
  const { data } = await supabase.rpc("count_new_posts", { p_feed: feed, p_since: since });
  return z.number().catch(0).parse(data);
}
