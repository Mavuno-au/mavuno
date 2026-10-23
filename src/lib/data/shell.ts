import "server-only";
import { cookies } from "next/headers";
import { cache } from "react";
import { z } from "zod";
import { parsePeople } from "@/lib/domain";
import { createClient } from "@/lib/supabase/server";
import type { Viewer } from "@/lib/viewer";
import { HIDDEN_COOKIE, isHidden, parseRound, ROUND_COOKIE, spareSuggestions, SUGGESTIONS_PER_PAGE, suggestionDay, suggestionPages } from "@/lib/who-to-follow";

const topicRows = z.array(z.object({ topic: z.string(), post_count: z.number(), people_count: z.number() }));

export async function loadCounts() {
  const supabase = await createClient();
  const [notifications, messages] = await Promise.all([supabase.rpc("unread_notification_count"), supabase.rpc("unread_message_count")]);
  return { notifications: z.number().catch(0).parse(notifications.data), messages: z.number().catch(0).parse(messages.data) };
}

const viewerCardRow = z.object({ bio: z.string(), posts_count: z.number(), following_count: z.number(), followers_count: z.number() });

// The signed-in member's own counts and bio, for the side column.
export async function loadViewerCard(viewer: Viewer | null) {
  if (!viewer) return null;
  const supabase = await createClient();
  const { data } = await supabase.from("profiles").select("bio, posts_count, following_count, followers_count").eq("id", viewer.id).maybeSingle();
  if (!data) return null;
  const row = viewerCardRow.parse(data);
  return { bio: row.bio.split("\n")[0] ?? "", posts: row.posts_count, following: row.following_count, followers: row.followers_count };
}

export async function loadTrendingTopics(limit = 8) {
  const supabase = await createClient();
  const { data } = await supabase.rpc("trending_topics", { p_days: 7, p_limit: limit });
  return topicRows.parse(data ?? []).map((row) => ({ topic: row.topic, posts: row.post_count, people: row.people_count }));
}

export async function loadSuggestions(limit = 4) {
  const supabase = await createClient();
  const { data } = await supabase.rpc("suggested_profiles", { p_limit: limit });
  return parsePeople(data);
}

const poolSources = z.array(z.object({ source: z.enum(["network", "popular"]) }));

// One page of the day's Who to follow. `pages` is how many there are, so the
// refresh button only shows when there is somewhere to go. `spares` step in
// when someone on the page is dismissed, without another request.
export async function loadWhoToFollow(viewer: Viewer, round: number, limit = SUGGESTIONS_PER_PAGE) {
  const supabase = await createClient();
  const { data } = await supabase.rpc("suggestion_pool", { p_network_limit: limit * 10 });
  const sources = poolSources.parse(data ?? []);
  const people = parsePeople(data);
  const day = suggestionDay();
  const pages = suggestionPages(
    people.filter((_, i) => sources[i]?.source === "network"),
    people.filter((_, i) => sources[i]?.source === "popular"),
    limit,
    `${viewer.id}:${day}`,
  );
  return { people: pages[round % pages.length] ?? [], spares: spareSuggestions(pages, round, limit), pages: pages.length, round, day };
}

export type WhoToFollowBlock = { kind: "none" } | { kind: "hidden" } | { kind: "empty" } | { kind: "page"; page: Awaited<ReturnType<typeof loadWhoToFollow>> };

// What this browser shows for Who to follow: nothing for guests, nothing when
// hidden, and otherwise the page it last refreshed to today.
// Cached per request: the home feed and the side column both show it.
export const loadWhoToFollowBlock = cache(async (viewer: Viewer | null): Promise<WhoToFollowBlock> => {
  if (!viewer) return { kind: "none" };
  const store = await cookies();
  if (isHidden(store.get(HIDDEN_COOKIE)?.value)) return { kind: "hidden" };
  const page = await loadWhoToFollow(viewer, parseRound(store.get(ROUND_COOKIE)?.value, suggestionDay()));
  return page.people.length === 0 ? { kind: "empty" } : { kind: "page", page };
});

const cityRow = z.object({ id: z.number(), slug: z.string(), name: z.string(), state: z.string() });
export type City = z.infer<typeof cityRow>;

export async function loadCities(): Promise<City[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("cities").select("id, slug, name, state").order("name");
  return z.array(cityRow).parse(data ?? []);
}

export async function loadViewerCity(viewer: Viewer | null) {
  if (!viewer?.cityId) return null;
  const supabase = await createClient();
  const { data } = await supabase.from("cities").select("id, slug, name, state").eq("id", viewer.cityId).maybeSingle();
  return data ? cityRow.parse(data) : null;
}
