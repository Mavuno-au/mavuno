import "server-only";
import { z } from "zod";
import { parsePeople, profileCardSchema, CITY_PHOTO_COLUMNS, cityPhotoSchema } from "@/lib/domain";
import { publicEnv } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import type { Viewer } from "@/lib/viewer";
import { EDITABLE, editableRow, SETTINGS_COLUMNS, settingsRow } from "@/lib/profile-form";

export type { DmPolicy, EditableProfile, PrivateSettings } from "@/lib/profile-form";

export async function loadEditableProfile(match: { id: string } | { username: string }) {
  const supabase = await createClient();
  const { data } = await supabase.from("profiles").select(EDITABLE).match(match).maybeSingle();
  return data ? editableRow.parse(data) : null;
}

export async function loadPrivateSettings(viewer: Viewer) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("profile_settings")
    .select(SETTINGS_COLUMNS)
    .eq("id", viewer.id)
    .single();
  return settingsRow.parse(data);
}

const CARD = "id, username, display_name, avatar_url, colour:effective_colour, account_type, org_verified, headline";

const relationRows = z.array(z.object({ created_at: z.string(), profile: profileCardSchema }));

export async function loadSafetyLists(viewer: Viewer) {
  const supabase = await createClient();
  const [mutes, blocks] = await Promise.all([
    supabase.from("mutes").select(`created_at, profile:profiles!mutes_muted_id_fkey(${CARD})`).eq("muter_id", viewer.id).order("created_at", { ascending: false }),
    supabase.from("blocks").select(`created_at, profile:profiles!blocks_blocked_id_fkey(${CARD})`).eq("blocker_id", viewer.id).order("created_at", { ascending: false }),
  ]);
  const toList = (rows: unknown) => relationRows.parse(rows ?? []).map((row) => ({ since: row.created_at, profile: row.profile }));
  return { muted: toList(mutes.data), blocked: toList(blocks.data) };
}

const spaceRows = z.array(
  z
    .object({
      id: z.uuid(),
      slug: z.string(),
      name: z.string(),
      description: z.string(),
      kind: z.enum(["city", "interest"]),
      city_id: z.number().nullable(),
      emoji: z.string().nullable(),
      members_count: z.number(),
      city: cityPhotoSchema,
    })
    .transform((s) => ({ id: s.id, slug: s.slug, name: s.name, description: s.description, kind: s.kind, cityId: s.city_id, emoji: s.emoji, members: s.members_count, photo: s.city })),
);

export type SpaceChoice = z.infer<typeof spaceRows>[number];

export async function loadOfficialSpaces(viewer: Viewer) {
  const supabase = await createClient();
  const [spaces, memberships] = await Promise.all([
    supabase.from("spaces").select(`id, slug, name, description, kind, city_id, emoji, members_count, city:cities(${CITY_PHOTO_COLUMNS})`).eq("is_official", true).order("members_count", { ascending: false }),
    supabase.from("space_members").select("space_id").eq("user_id", viewer.id),
  ]);
  const joined = z.array(z.object({ space_id: z.uuid() })).parse(memberships.data ?? []).map((row) => row.space_id);
  return { spaces: spaceRows.parse(spaces.data ?? []), joined };
}

export async function loadStarterSuggestions() {
  const supabase = await createClient();
  const [people, organisations] = await Promise.all([
    supabase.rpc("suggested_profiles", { p_limit: 8, p_account_type: "person" }),
    supabase.rpc("suggested_profiles", { p_limit: 6, p_account_type: "organisation" }),
  ]);
  return { people: parsePeople(people.data), organisations: parsePeople(organisations.data) };
}

const MEDIA_MARKER = `${publicEnv.supabaseUrl}/storage/v1/object/public/media/`;

export const mediaPath = (url: string | null) => (url?.startsWith(MEDIA_MARKER) ? url.slice(MEDIA_MARKER.length) : null);

