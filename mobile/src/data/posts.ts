import { z } from "zod";
import { parsePosts, parseReplyPreviews, postRowSchema, type Post, type PostRow, type ReplyPreviews, type ThreadPlace } from "@/lib/domain";
import { cursorOf, feedTime, PAGE_SIZE, parseTimeCursor, THREAD_MAX_LENGTH, THREAD_PAGE_SIZE } from "@/lib/feeds";
import { DEFAULT_REPLY_PREVIEWS } from "@/lib/reply-previews";
import { done, failFrom, type Result } from "@/lib/result";
import { supabase } from "@/data/supabase";

// The website's feed queries (src/lib/data/posts.ts), against the same
// database functions, so row level security, mutes and blocks apply the same.

export type FeedKind = "following" | "latest";
export type ProfileTab = "posts" | "replies" | "media";
export type Source = { kind: FeedKind } | { kind: "profile"; profileId: string; tab: ProfileTab };

export type Page = { posts: PostRow[]; previews: ReplyPreviews; next: string | null };

function query(source: Source, cursor: string | null) {
  const after = parseTimeCursor(cursor);
  const byTime = { p_before: after?.key ?? null, p_before_id: after?.id ?? null, p_limit: PAGE_SIZE };
  switch (source.kind) {
    case "following":
      return supabase.rpc("feed_following", byTime);
    case "latest":
      return supabase.rpc("feed_latest", byTime);
    case "profile":
      return supabase.rpc("feed_profile", { p_profile_id: source.profileId, p_kind: source.tab, ...byTime });
    default: {
      const exhaustive: never = source;
      return exhaustive;
    }
  }
}

// Following and Latest sort by when a post was published; a profile by when it was written.
const sortKey = (source: Source, post: PostRow) => (source.kind === "profile" ? post.createdAt : feedTime(post));

async function loadReplyPreviews(posts: PostRow[]): Promise<ReplyPreviews> {
  const ids = posts.flatMap((post) => (post.kind === "post" && post.replies > 0 ? [post.id] : []));
  if (ids.length === 0) return {};
  const { data, error } = await supabase.rpc("reply_previews", { p_post_ids: ids, p_limit: DEFAULT_REPLY_PREVIEWS });
  if (error) throw new Error(`Reply previews failed: ${error.message}`);
  return parseReplyPreviews(data);
}

export async function loadFeed(source: Source, cursor: string | null): Promise<Page> {
  const { data, error } = await query(source, cursor);
  if (error) throw new Error(`Feed ${source.kind} failed: ${error.message}`);
  const posts = parsePosts(data);
  const last = posts.at(-1);
  const next = posts.length === PAGE_SIZE && last ? cursorOf(sortKey(source, last), last.id) : null;
  return { posts, previews: source.kind === "profile" ? {} : await loadReplyPreviews(posts), next };
}

export async function loadReplies(postId: string, cursor: string | null) {
  const after = parseTimeCursor(cursor);
  const { data, error } = await supabase.rpc("post_replies", { p_post_id: postId, p_after: after?.key ?? null, p_after_id: after?.id ?? null, p_limit: PAGE_SIZE });
  if (error) throw new Error(`Replies failed: ${error.message}`);
  const replies = parsePosts(data);
  const last = replies.at(-1);
  return { replies, next: replies.length === PAGE_SIZE && last ? cursorOf(last.createdAt, last.id) : null };
}

export async function loadContinuation(postId: string) {
  const { data, error } = await supabase.rpc("post_continuation", { p_post_id: postId, p_limit: THREAD_PAGE_SIZE });
  if (error) throw new Error(`Thread failed: ${error.message}`);
  return parsePosts(data);
}

async function threadPosition(postId: string) {
  const { data, error } = await supabase.rpc("thread_position", { p_post_id: postId });
  if (error) throw new Error(`Thread position failed: ${error.message}`);
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

// A post's page: what it answers, the post, the thread it continues, its replies.
export async function loadThread(postId: string): Promise<Thread> {
  const [row, ancestors] = await Promise.all([
    supabase.from("post_details").select("*").eq("id", postId).maybeSingle(),
    supabase.rpc("post_ancestors", { p_post_id: postId }),
  ]);
  if (row.error) throw new Error(`Post failed: ${row.error.message}`);
  if (ancestors.error) throw new Error(`Ancestors failed: ${ancestors.error.message}`);
  if (!row.data) return { kind: "missing" };
  const post = postRowSchema.parse(row.data);
  if (post.kind === "tombstone") return { kind: "missing" };
  const [{ replies, next }, continuation] = await Promise.all([loadReplies(postId, null), loadContinuationOf(post)]);
  return { kind: "thread", post, ancestors: parsePosts(ancestors.data), continuation, replies, next };
}

export async function loadPinnedPost(postId: string | null) {
  if (!postId) return null;
  const { data } = await supabase.from("post_details").select("*").eq("id", postId).maybeSingle();
  if (!data) return null;
  const post = postRowSchema.parse(data);
  return post.kind === "post" && post.status === "published" ? post : null;
}

// The website's setLike (src/app/actions/posts.ts): one row the viewer owns.
// Liking twice is not an error, and neither is unliking what was never liked.
export async function setLike(viewerId: string, postId: string, liked: boolean): Promise<Result> {
  const row = { user_id: viewerId, post_id: z.uuid().parse(postId) };
  const { error } = liked
    ? await supabase.from("likes").upsert(row, { onConflict: "user_id,post_id", ignoreDuplicates: true })
    : await supabase.from("likes").delete().match(row);
  return error ? failFrom(error) : done;
}
