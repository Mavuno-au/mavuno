import "server-only";
import { randomInt } from "node:crypto";
import { cookies } from "next/headers";
import { cache } from "react";
import { z } from "zod";
import { parsePeople, parsePosts, parseReplyPreviews, postRowSchema, type PersonSummary, type Post, type PostRow, type ReplyPreviews, type ThreadPlace } from "@/lib/domain";
import { PAGE_SIZE, THREAD_MAX_LENGTH, THREAD_PAGE_SIZE, type FeedSource } from "@/lib/feeds";
import { parseReplyPreviewCount, REPLY_PREVIEWS_COOKIE } from "@/lib/reply-previews";
import { createClient } from "@/lib/supabase/server";

export type FeedPage = { posts: PostRow[]; previews: ReplyPreviews; next: string | null };

// A new draw of Trending for each visit.
export const newTrendingSeed = () => randomInt(0, 2 ** 47);

// The posts that continue a post on its page, and the post's own place in that thread.
export type Continuation = { kind: "none" } | { kind: "thread"; place: ThreadPlace; parts: PostRow[] };

const savedRows = z.array(z.object({ saved_at: z.string(), post: z.unknown() }));
const trendingRows = z.array(z.object({ trending_score: z.union([z.number(), z.string()]).transform(String), post: z.unknown() }));

// Trending pages after the score and id of the last post shown.
const trendingCursor = z
  .string()
  .regex(/^-?\d+(\.\d+)?:[0-9a-f-]{36}$/)
  .transform((cursor) => {
    const [score, id] = cursor.split(":");
    return { p_after_score: score ?? null, p_after_id: z.uuid().parse(id) };
  });

async function query(source: FeedSource, cursor: string | null) {
  const supabase = await createClient();
  const page = { p_before: cursor, p_limit: PAGE_SIZE };
  switch (source.kind) {
    case "following":
      return supabase.rpc("feed_following", page);
    case "latest":
      return supabase.rpc("feed_latest", page);
    case "trending":
      return supabase.rpc("feed_trending", { p_seed: source.seed, ...(cursor ? trendingCursor.parse(cursor) : {}), p_limit: PAGE_SIZE });
    case "saved":
      return supabase.rpc("feed_saved", page);
    case "space":
      return supabase.rpc("feed_space", { p_space_id: source.spaceId, ...page });
    case "topic":
      return supabase.rpc("feed_topic", { p_topic: source.topic, ...page });
    case "profile":
      return supabase.rpc("feed_profile", { p_profile_id: source.profileId, p_kind: source.tab, ...page });
    case "local":
      return supabase.rpc("feed_local", { p_city_id: source.cityId, p_radius_km: source.radiusKm, ...page });
    case "search":
      return supabase.rpc("search_posts", { p_query: source.query, ...page });
    default: {
      const exhaustive: never = source;
      return exhaustive;
    }
  }
}

async function readPage(source: FeedSource, cursor: string | null): Promise<Omit<FeedPage, "previews">> {
  const { data, error } = await query(source, cursor);
  if (error) throw new Error(`Feed ${source.kind} failed: ${error.message}`);

  if (source.kind === "saved") {
    const rows = savedRows.parse(data);
    const posts = parsePosts(rows.map((row) => row.post));
    return { posts, next: rows.length === PAGE_SIZE ? (rows.at(-1)?.saved_at ?? null) : null };
  }

  if (source.kind === "trending") {
    const rows = trendingRows.parse(data);
    const posts = parsePosts(rows.map((row) => row.post));
    const last = rows.at(-1);
    const lastPost = posts.at(-1);
    return { posts, next: rows.length === PAGE_SIZE && last && lastPost ? `${last.trending_score}:${lastPost.id}` : null };
  }

  const posts = parsePosts(data);
  if (posts.length < PAGE_SIZE) return { posts, next: null };
  return { posts, next: posts.at(-1)?.createdAt ?? null };
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

export async function loadReplies(postId: string, after: string | null = null) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("post_replies", { p_post_id: postId, p_after: after, p_limit: PAGE_SIZE });
  if (error) throw new Error(`Replies failed: ${error.message}`);
  const replies = parsePosts(data);
  return { replies, next: replies.length === PAGE_SIZE ? (replies.at(-1)?.createdAt ?? null) : null };
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
export async function loadLikers(postId: string, before: string | null): Promise<Likers> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("post_likers", { p_post_id: postId, p_before: before, p_limit: LIKERS_PAGE });
  if (error) throw new Error(`Likers failed: ${error.message}`);
  const times = z.array(z.object({ liked_at: z.string() })).parse(data ?? []);
  return { people: parsePeople(data), next: times.length === LIKERS_PAGE ? (times.at(-1)?.liked_at ?? null) : null };
}

export async function countNewPosts(feed: "following" | "latest", since: string) {
  const supabase = await createClient();
  const { data } = await supabase.rpc("count_new_posts", { p_feed: feed, p_since: since });
  return z.number().catch(0).parse(data);
}
