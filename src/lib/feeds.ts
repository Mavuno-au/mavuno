import { z } from "zod";
import type { PostRow } from "@/lib/domain";

// Every list of posts in the app is one of these. Client components send a
// FeedSource back to load more, so it is parsed again on the server.
export const feedSourceSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("following") }),
  z.object({ kind: z.literal("latest") }),
  // Each visit draws Trending with a new seed; its later pages reuse it.
  z.object({ kind: z.literal("trending"), seed: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER) }),
  z.object({ kind: z.literal("saved") }),
  z.object({ kind: z.literal("space"), spaceId: z.uuid() }),
  z.object({ kind: z.literal("topic"), topic: z.string().regex(/^[a-z][a-z0-9_]{1,39}$/) }),
  z.object({ kind: z.literal("profile"), profileId: z.uuid(), tab: z.enum(["posts", "replies", "media"]) }),
  z.object({ kind: z.literal("local"), cityId: z.number().int().positive(), radiusKm: z.number().int().min(10).max(200) }),
  z.object({ kind: z.literal("search"), query: z.string().min(3).max(100) }),
]);

export type FeedSource = z.infer<typeof feedSourceSchema>;

export const PAGE_SIZE = 20;

// Latest and Following sort by when a post was published, so a post approved
// after review comes in at the top. One still waiting has only its writing time.
export const feedTime = (row: Pick<PostRow, "publishedAt" | "createdAt">) => row.publishedAt ?? row.createdAt;

// Lists page after the sort key and id of the last row shown, so rows that
// share a key (scheduled posts published together) are never skipped.
export const cursorOf = (key: string, id: string) => `${key}:${id}`;
export const splitCursor = (cursor: string) => ({ key: cursor.slice(0, -37), id: cursor.slice(-36) });

const timeCursor = z
  .string()
  .regex(/^.+:[0-9a-f-]{36}$/)
  .transform(splitCursor)
  .pipe(z.object({ key: z.iso.datetime({ offset: true }), id: z.uuid() }));

export const parseTimeCursor = (cursor: string | null) => (cursor ? timeCursor.parse(cursor) : null);

// A continued thread reads this many posts at a time, and at most THREAD_MAX_LENGTH past the post on screen.
export const THREAD_PAGE_SIZE = 10;
export const THREAD_MAX_LENGTH = 100;

export const HOME_FEEDS = ["following", "latest", "trending"] as const;
export type HomeFeed = (typeof HOME_FEEDS)[number];
export const isHomeFeed = (value: unknown): value is HomeFeed => HOME_FEEDS.some((feed) => feed === value);

// Trending and search page after a score.
const scoreCursor = z
  .string()
  .regex(/^-?\d+(\.\d+)?:[0-9a-f-]{36}$/)
  .transform(splitCursor)
  .pipe(z.object({ key: z.string(), id: z.uuid() }));

// The database function that reads a feed, and its arguments for one page.
export function feedCall(source: FeedSource, cursor: string | null): { fn: string; args: Record<string, unknown> } {
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
      return { fn: "feed_following", args: byTime() };
    case "latest":
      return { fn: "feed_latest", args: byTime() };
    case "trending":
      return { fn: "feed_trending", args: { p_seed: source.seed, ...byScore() } };
    case "saved":
      return { fn: "feed_saved", args: byTime() };
    case "space":
      return { fn: "feed_space", args: { p_space_id: source.spaceId, ...byTime() } };
    case "topic":
      return { fn: "feed_topic", args: { p_topic: source.topic, ...byTime() } };
    case "profile":
      return { fn: "feed_profile", args: { p_profile_id: source.profileId, p_kind: source.tab, ...byTime() } };
    case "local":
      return { fn: "feed_local", args: { p_city_id: source.cityId, p_radius_km: source.radiusKm, ...byTime() } };
    case "search":
      return { fn: "search_posts", args: { p_query: source.query, ...byScore() } };
    default: {
      const exhaustive: never = source;
      return exhaustive;
    }
  }
}

const savedRows = z.array(z.object({ saved_at: z.string(), post: z.unknown() }));
const score = z.union([z.number(), z.string()]).transform(String);
const trendingRows = z.array(z.object({ trending_score: score, post: z.unknown() }).transform((row) => ({ score: row.trending_score, post: row.post })));
const searchRows = z.array(z.object({ search_score: score, post: z.unknown() }).transform((row) => ({ score: row.search_score, post: row.post })));

// One page of a feed from what its function returned, with the cursor for the
// next. `parse` turns rows into posts: the website refuses a page with a bad
// row, the app drops just that row.
export function feedPage(source: FeedSource, data: unknown, parse: (rows: unknown) => PostRow[]): { posts: PostRow[]; next: string | null } {
  switch (source.kind) {
    case "saved": {
      const rows = savedRows.parse(data);
      const posts = parse(rows.map((row) => row.post));
      const last = rows.at(-1);
      const lastPost = posts.at(-1);
      return { posts, next: rows.length === PAGE_SIZE && last && lastPost ? cursorOf(last.saved_at, lastPost.id) : null };
    }
    case "trending":
    case "search": {
      const rows = (source.kind === "trending" ? trendingRows : searchRows).parse(data);
      const posts = parse(rows.map((row) => row.post));
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
      const posts = parse(data);
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
