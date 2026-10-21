import type { MetadataRoute } from "next";
import { z } from "zod";
import { publicEnv } from "@/lib/env";
import { createGuestClient } from "@/lib/supabase/server";

// Rebuilt at most hourly rather than on every crawl.
export const revalidate = 3600;

// PostgREST returns at most this many rows a request; pages are read until one comes back short.
const PAGE = 1000;
// Well under the 50,000 addresses a sitemap file may list.
const PER_FILE = 20_000;

const STATIC_PATHS = ["/", "/latest", "/spaces", "/events", "/opportunities", "/discover", "/about", "/help", "/rules", "/privacy", "/terms"];

const postRows = z.array(z.object({ id: z.uuid(), created_at: z.string(), published_at: z.string().nullable(), author: z.object({ username: z.string() }).nullable() }));
const profileRows = z.array(z.object({ username: z.string(), updated_at: z.string() }));
const spaceRows = z.array(z.object({ slug: z.string(), created_at: z.string(), last_post_at: z.string().nullable() }));
const eventRows = z.array(z.object({ id: z.uuid(), created_at: z.string(), cancelled_at: z.string().nullable() }));
const opportunityRows = z.array(z.object({ id: z.uuid(), created_at: z.string() }));

const url = (path: string) => new URL(path, publicEnv.siteUrl).href;

type File = { kind: "pages" } | { kind: "people"; index: number } | { kind: "posts"; index: number };

const fileId = (file: File) => (file.kind === "pages" ? "pages" : `${file.kind}-${file.index}`);

function parseFileId(id: string): File | null {
  if (id === "pages") return { kind: "pages" };
  const match = /^(people|posts)-(\d{1,4})$/.exec(id);
  if (!match) return null;
  return { kind: match[1] === "people" ? "people" : "posts", index: Number(match[2]) };
}

// Posts and profiles get a file per 20,000 in the order they were created, so
// the older files keep their contents and only the newest one grows. A failed
// count still yields the first file of each kind.
export async function generateSitemaps() {
  const supabase = createGuestClient();
  const [posts, people] = await Promise.all([
    supabase.from("posts").select("id", { count: "exact", head: true }).eq("status", "published").is("deleted_at", null),
    supabase.from("profiles").select("id", { count: "exact", head: true }).gt("posts_count", 0),
  ]);
  const files = (kind: "people" | "posts", total: number | null) => Array.from({ length: Math.max(1, Math.ceil((total ?? 0) / PER_FILE)) }, (_, index) => ({ id: fileId({ kind, index }) }));
  return [{ id: fileId({ kind: "pages" }) }, ...files("people", people.count), ...files("posts", posts.count)];
}

// Reads one file's window of rows, a page at a time.
async function readWindow<T>(read: (from: number, to: number) => PromiseLike<{ data: unknown }>, parse: (rows: unknown) => T[], index: number) {
  const start = index * PER_FILE;
  const all: T[] = [];
  while (all.length < PER_FILE) {
    const from = start + all.length;
    const rows = parse((await read(from, from + PAGE - 1)).data ?? []);
    all.push(...rows);
    if (rows.length < PAGE) break;
  }
  return all;
}

// What a guest can read: published posts, profiles with posts, spaces,
// published events, and opportunities still open.
export default async function sitemap({ id }: { id: Promise<string> }): Promise<MetadataRoute.Sitemap> {
  const file = parseFileId(await id);
  if (!file) return [];
  const supabase = createGuestClient();

  switch (file.kind) {
    case "pages": {
      const [spaces, events, opportunities] = await Promise.all([
        supabase.from("spaces").select("slug, created_at, last_post_at").order("members_count", { ascending: false }).limit(PAGE),
        supabase.from("events").select("id, created_at, cancelled_at").eq("status", "published").order("starts_at", { ascending: false }).limit(PAGE),
        supabase
          .from("opportunities")
          .select("id, created_at")
          .eq("status", "published")
          .is("closed_at", null)
          .or(`deadline_at.is.null,deadline_at.gt.${new Date().toISOString()}`)
          .order("created_at", { ascending: false })
          .limit(PAGE),
      ]);
      return [
        ...STATIC_PATHS.map((path) => ({ url: url(path), changeFrequency: "hourly" as const })),
        ...spaceRows.parse(spaces.data ?? []).map((space) => ({ url: url(`/spaces/${space.slug}`), lastModified: space.last_post_at ?? space.created_at, changeFrequency: "daily" as const })),
        ...eventRows.parse(events.data ?? []).map((event) => ({ url: url(`/events/${event.id}`), lastModified: event.cancelled_at ?? event.created_at })),
        ...opportunityRows.parse(opportunities.data ?? []).map((opportunity) => ({ url: url(`/opportunities/${opportunity.id}`), lastModified: opportunity.created_at, changeFrequency: "daily" as const })),
      ];
    }
    case "people": {
      const profiles = await readWindow(
        (from, to) => supabase.from("profiles").select("username, updated_at").gt("posts_count", 0).order("created_at").order("id").range(from, to),
        (rows) => profileRows.parse(rows),
        file.index,
      );
      return profiles.map((profile) => ({ url: url(`/@${profile.username}`), lastModified: profile.updated_at }));
    }
    case "posts": {
      const posts = await readWindow(
        (from, to) =>
          supabase
            .from("posts")
            .select("id, created_at, published_at, author:profiles!posts_author_id_fkey(username)")
            .eq("status", "published")
            .is("deleted_at", null)
            .order("created_at")
            .order("id")
            .range(from, to),
        (rows) => postRows.parse(rows),
        file.index,
      );
      return posts.flatMap((post) => (post.author ? [{ url: url(`/@${post.author.username}/posts/${post.id}`), lastModified: post.published_at ?? post.created_at }] : []));
    }
  }
}
