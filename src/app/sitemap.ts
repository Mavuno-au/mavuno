import type { MetadataRoute } from "next";
import { z } from "zod";
import { publicEnv } from "@/lib/env";
import { createGuestClient } from "@/lib/supabase/server";

// Rebuilt at most hourly rather than on every crawl.
export const revalidate = 3600;

// PostgREST returns at most this many rows a request; pages are read until one comes back short.
const PAGE = 1000;
// Well under the 50,000 addresses a sitemap may list.
const MAX_POSTS = 20_000;

const STATIC_PATHS = ["/", "/latest", "/spaces", "/events", "/opportunities", "/discover", "/about", "/rules", "/privacy", "/terms"];

const postRows = z.array(z.object({ id: z.uuid(), created_at: z.string(), author: z.object({ username: z.string() }).nullable() }));
const profileRows = z.array(z.object({ username: z.string(), updated_at: z.string() }));
const spaceRows = z.array(z.object({ slug: z.string(), created_at: z.string(), last_post_at: z.string().nullable() }));
const eventRows = z.array(z.object({ id: z.uuid(), created_at: z.string() }));

async function readPages<T>(read: (from: number, to: number) => PromiseLike<{ data: unknown }>, parse: (rows: unknown) => T[], max: number) {
  const all: T[] = [];
  while (all.length < max) {
    const rows = parse((await read(all.length, all.length + PAGE - 1)).data ?? []);
    all.push(...rows);
    if (rows.length < PAGE) break;
  }
  return all;
}

// What a guest can read: published posts, profiles with posts, spaces and published events.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const supabase = createGuestClient();
  const url = (path: string) => new URL(path, publicEnv.siteUrl).href;

  const [posts, profiles, spaces, events] = await Promise.all([
    readPages(
      (from, to) =>
        supabase
          .from("posts")
          .select("id, created_at, author:profiles!posts_author_id_fkey(username)")
          .eq("status", "published")
          .is("deleted_at", null)
          .order("created_at", { ascending: false })
          .range(from, to),
      (rows) => postRows.parse(rows),
      MAX_POSTS,
    ),
    readPages(
      (from, to) => supabase.from("profiles").select("username, updated_at").gt("posts_count", 0).order("created_at").range(from, to),
      (rows) => profileRows.parse(rows),
      MAX_POSTS,
    ),
    supabase.from("spaces").select("slug, created_at, last_post_at").order("members_count", { ascending: false }).limit(PAGE),
    supabase.from("events").select("id, created_at").eq("status", "published").order("starts_at", { ascending: false }).limit(PAGE),
  ]);

  return [
    ...STATIC_PATHS.map((path) => ({ url: url(path), changeFrequency: "hourly" as const })),
    ...spaceRows.parse(spaces.data ?? []).map((space) => ({ url: url(`/spaces/${space.slug}`), lastModified: space.last_post_at ?? space.created_at, changeFrequency: "daily" as const })),
    ...eventRows.parse(events.data ?? []).map((event) => ({ url: url(`/events/${event.id}`), lastModified: event.created_at })),
    ...profiles.map((profile) => ({ url: url(`/@${profile.username}`), lastModified: profile.updated_at })),
    ...posts.flatMap((post) => (post.author ? [{ url: url(`/@${post.author.username}/posts/${post.id}`), lastModified: post.created_at }] : [])),
  ];
}
