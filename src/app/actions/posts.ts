"use server";

import { after } from "next/server";
import { z } from "zod";
import { runTasksFor, sweepDueTasks } from "@/lib/background-tasks";
import { loadContinuation, loadFeed, loadLikers, loadReplies, countNewPosts, type FeedPage, type Likers } from "@/lib/data/posts";
import { linkPreviewSchema, postRowSchema, type LinkPreview, type PostRow } from "@/lib/domain";
import { feedSourceSchema } from "@/lib/feeds";
import { publicEnv } from "@/lib/env";
import { done, fail, failFrom, ok, type Result } from "@/lib/result";
import { createClient } from "@/lib/supabase/server";
import { tokenize } from "@/lib/text";
import { getViewer } from "@/lib/viewer";

const id = z.uuid();
const MEDIA_URL = `${new URL(publicEnv.supabaseUrl).origin}/storage/v1/object/public/media/`;

const newPostSchema = z.object({
  body: z.string().max(4000),
  language: z.string().regex(/^[a-z]{2,3}$/),
  authorId: id.nullable(),
  parentId: id.nullable(),
  quoteId: id.nullable(),
  spaceId: id.nullable(),
  eventId: id.nullable(),
  opportunityId: id.nullable(),
  linkUrl: z.url().nullable(),
  images: z
    .array(
      z
        .object({ path: z.string().max(300), url: z.url(), width: z.number().int().positive(), height: z.number().int().positive(), alt: z.string().max(1000) })
        // The database checks the path; only here is the project's own storage host known.
        .refine((image) => image.url === `${MEDIA_URL}${image.path}`),
    )
    .max(4),
  poll: z.object({ options: z.array(z.string().trim().min(1).max(50)).min(2).max(4), durationHours: z.union([z.literal(1), z.literal(24), z.literal(72), z.literal(168)]) }).nullable(),
});

export type NewPost = z.input<typeof newPostSchema>;

// Scheduled posts are top-level posts, published later by the database.
const scheduledPostSchema = newPostSchema
  .pick({ body: true, language: true, authorId: true, spaceId: true, linkUrl: true, images: true, poll: true })
  .extend({ scheduledAt: z.iso.datetime({ offset: true }) });

export type NewScheduledPost = z.input<typeof scheduledPostSchema>;

// Only a link that is in the post can become its card. The server fetches the
// card after the post is created.
function cardLink(body: string, linkUrl: string | null) {
  const links = new Set(tokenize(body).flatMap((segment) => (segment.kind === "url" ? [segment.href] : [])));
  return linkUrl && links.has(linkUrl) ? linkUrl : null;
}

const pollArgument = (poll: z.infer<typeof newPostSchema>["poll"]) => poll && { options: poll.options, duration_hours: poll.durationHours };

export async function createPost(input: NewPost): Promise<Result<PostRow>> {
  const parsed = newPostSchema.safeParse(input);
  if (!parsed.success) return fail("Check your post and try again.");
  const post = parsed.data;
  if (!(await getViewer())) return fail("Sign in to post.");

  const supabase = await createClient();
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
  // The database queued its card and automatic check; run them now.
  after(() => runTasksFor(created));

  const { data: row } = await supabase.from("post_details").select("*").eq("id", created).single();
  return ok(postRowSchema.parse(row));
}

export async function schedulePost(input: NewScheduledPost): Promise<Result> {
  const parsed = scheduledPostSchema.safeParse(input);
  if (!parsed.success) return fail("Check your post and try again.");
  const post = parsed.data;
  if (!(await getViewer())) return fail("Sign in to schedule a post.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("schedule_post", {
    p_scheduled_at: post.scheduledAt,
    p_body: post.body,
    p_language: post.language,
    p_author_id: post.authorId,
    p_space_id: post.spaceId,
    p_link_url: cardLink(post.body, post.linkUrl),
    p_images: post.images,
    p_poll: pollArgument(post.poll),
  });
  return error ? failFrom(error) : done;
}

// The composer waits for the card of a post it just made.
export async function loadLinkPreview(postId: string): Promise<LinkPreview | null> {
  const parsed = id.safeParse(postId);
  if (!parsed.success) return null;
  const supabase = await createClient();
  const { data } = await supabase.from("posts").select("link_preview").eq("id", parsed.data).maybeSingle();
  return z.object({ link_preview: linkPreviewSchema.nullable().catch(null) }).nullable().parse(data)?.link_preview ?? null;
}

export async function cancelScheduledPost(scheduledId: string): Promise<Result> {
  const parsed = id.safeParse(scheduledId);
  if (!parsed.success) return fail("That scheduled post is no longer available.");
  const supabase = await createClient();
  const { data, error } = await supabase.from("scheduled_posts").delete().eq("id", parsed.data).select("id");
  if (error) return failFrom(error);
  return data.length > 0 ? done : fail("This post has already gone out. Refresh to see what happened.");
}

async function rpc(name: string, args: Record<string, unknown>): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase.rpc(name, args);
  return error ? failFrom(error) : done;
}

export async function deletePost(postId: string) {
  return rpc("delete_post", { p_post_id: id.parse(postId) });
}

export async function restorePost(postId: string) {
  return rpc("restore_post", { p_post_id: id.parse(postId) });
}

export async function pinPost(postId: string) {
  return rpc("pin_post", { p_post_id: id.parse(postId) });
}

export async function unpinPost(profileId: string) {
  return rpc("unpin_post", { p_profile_id: id.parse(profileId) });
}

export async function votePoll(postId: string, optionId: string) {
  return rpc("vote_poll", { p_post_id: id.parse(postId), p_option_id: id.parse(optionId) });
}

async function toggle(table: "likes" | "saves", postId: string, on: boolean): Promise<Result> {
  const viewer = await getViewer();
  if (!viewer) return fail("Sign in first.");
  const supabase = await createClient();
  const row = { user_id: viewer.id, post_id: id.parse(postId) };
  const { error } = on
    ? await supabase.from(table).upsert(row, { onConflict: "user_id,post_id", ignoreDuplicates: true })
    : await supabase.from(table).delete().match(row);
  return error ? failFrom(error) : done;
}

export async function setLike(postId: string, liked: boolean) {
  return toggle("likes", postId, liked);
}

export async function setSaved(postId: string, saved: boolean) {
  return toggle("saves", postId, saved);
}

export async function loadMore(source: unknown, cursor: string | null): Promise<FeedPage> {
  return loadFeed(feedSourceSchema.parse(source), cursor === null ? null : z.string().max(64).parse(cursor));
}

export async function loadMoreReplies(postId: string, after: string | null) {
  return loadReplies(id.parse(postId), after === null ? null : z.string().max(64).parse(after));
}

// The next page of a thread is the thread of the last post shown.
export async function loadMoreThread(lastPostId: string): Promise<Result<PostRow[]>> {
  const parsed = id.safeParse(lastPostId);
  if (!parsed.success) return fail("That thread is no longer available.");
  try {
    return ok(await loadContinuation(parsed.data));
  } catch {
    return fail("Couldn't load more of this thread. Try again.");
  }
}

export async function loadPostLikers(postId: string, before: string | null): Promise<Result<Likers>> {
  const parsed = z.object({ postId: id, before: z.iso.datetime({ offset: true }).nullable() }).safeParse({ postId, before });
  if (!parsed.success) return fail("That post is no longer available.");
  try {
    return ok(await loadLikers(parsed.data.postId, parsed.data.before));
  } catch {
    return fail("Couldn't load who liked this. Try again.");
  }
}

export async function newPostCount(feed: "following" | "latest", since: string) {
  after(sweepDueTasks);
  return countNewPosts(z.enum(["following", "latest"]).parse(feed), z.iso.datetime({ offset: true }).parse(since));
}
