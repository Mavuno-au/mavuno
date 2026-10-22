import "server-only";
import { z } from "zod";
import { parsePeople, profileCardSchema, CITY_PHOTO_COLUMNS, cityPhotoSchema } from "@/lib/domain";
import { publicEnv } from "@/lib/env";
import { createClient, type Supabase } from "@/lib/supabase/server";
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

const MEDIA_KINDS = ["posts", "avatars", "banners", "events"] as const;
const PAGE = 1000;

async function listFolder(supabase: Supabase, folder: string, offset = 0): Promise<string[]> {
  const { data } = await supabase.storage.from("media").list(folder, { limit: PAGE, offset });
  const paths = (data ?? []).map((file) => `${folder}/${file.name}`);
  return paths.length === PAGE ? [...paths, ...(await listFolder(supabase, folder, offset + PAGE))] : paths;
}

// Uses the viewer's own session: storage only lets people delete files under
// the profiles they act as.
export async function removeProfileMedia(profileIds: string[]) {
  const supabase = await createClient();
  const folders = profileIds.flatMap((profileId) => MEDIA_KINDS.map((kind) => `${profileId}/${kind}`));
  const paths = (await Promise.all(folders.map((folder) => listFolder(supabase, folder)))).flat();
  for (let start = 0; start < paths.length; start += PAGE) {
    await supabase.storage.from("media").remove(paths.slice(start, start + PAGE));
  }
}

// Organisations the person owns alone are deleted with their account.
export async function soleOwnedOrganisations(viewer: Viewer) {
  const owned = viewer.organisations.filter((org) => org.role === "owner").map((org) => org.id);
  if (owned.length === 0) return [];
  const supabase = await createClient();
  const { data } = await supabase.from("organisation_members").select("org_id, user_id").in("org_id", owned).eq("role", "owner");
  const owners = z.array(z.object({ org_id: z.uuid(), user_id: z.uuid() })).parse(data ?? []);
  return owned.filter((orgId) => owners.every((row) => row.org_id !== orgId || row.user_id === viewer.id));
}
