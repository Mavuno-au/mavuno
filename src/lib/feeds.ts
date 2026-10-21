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

// A continued thread reads this many posts at a time, and at most THREAD_MAX_LENGTH past the post on screen.
export const THREAD_PAGE_SIZE = 10;
export const THREAD_MAX_LENGTH = 100;

export const HOME_FEEDS = ["following", "latest", "trending"] as const;
export type HomeFeed = (typeof HOME_FEEDS)[number];
export const isHomeFeed = (value: unknown): value is HomeFeed => HOME_FEEDS.some((feed) => feed === value);
