import "server-only";
import { z } from "zod";
import { CITY_PHOTO_COLUMNS, cityPhotoSchema, parsePeople } from "@/lib/domain";
import { createClient } from "@/lib/supabase/server";

const spaceRow = z
  .object({
    slug: z.string(),
    name: z.string(),
    emoji: z.string().nullable(),
    kind: z.enum(["city", "interest"]),
    members_count: z.number(),
    posts_count: z.number(),
    last_post_at: z.string().nullable(),
    city: cityPhotoSchema,
  })
  .transform((s) => ({ slug: s.slug, name: s.name, emoji: s.emoji, kind: s.kind, members: s.members_count, posts: s.posts_count, lastPostAt: s.last_post_at, photo: s.city }));

export type SpaceSummary = z.infer<typeof spaceRow>;

export async function loadActiveSpaces(limit = 6): Promise<SpaceSummary[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("spaces")
    .select(`slug, name, emoji, kind, members_count, posts_count, last_post_at, city:cities(${CITY_PHOTO_COLUMNS})`)
    .order("last_post_at", { ascending: false, nullsFirst: false })
    .order("members_count", { ascending: false })
    .limit(limit);
  return z.array(spaceRow).parse(data ?? []);
}

export async function loadSuggestedOrganisations(limit = 4) {
  const supabase = await createClient();
  const { data } = await supabase.rpc("suggested_profiles", { p_limit: limit, p_account_type: "organisation" });
  return parsePeople(data);
}

export async function searchPeople(query: string, limit = 30) {
  const supabase = await createClient();
  const { data } = await supabase.rpc("search_profiles", { p_query: query, p_limit: limit });
  return parsePeople(data);
}
