import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { z } from "zod";
import { deletionDate } from "@/lib/age";
import { colourSchema } from "@/lib/domain";
import { credentials } from "@/lib/bearer";
import { createClient, createGuestClient, createTokenClient, type Supabase } from "@/lib/supabase/server";
import { signInPath } from "@/lib/safe-redirect";

const identity = z.object({
  id: z.uuid(),
  username: z.string(),
  display_name: z.string(),
  avatar_url: z.string().nullable(),
  colour: colourSchema,
});

export const IDENTITY = "id, username, display_name, avatar_url, colour:effective_colour";

const viewerRow = identity.extend({
  city_id: z.number().nullable(),
  languages: z.array(z.string()),
  profile_settings: z.object({
    site_role: z.enum(["member", "moderator", "admin"]),
    suspended_until: z.string().nullable(),
    banned_at: z.string().nullable(),
    rules_accepted_at: z.string().nullable(),
    translation_language: z.string().nullable(),
    onboarded_at: z.string().nullable(),
    age_confirmed_at: z.string().nullable(),
    age_deactivated_at: z.string().nullable(),
  }),
  organisation_members: z.array(
    z.object({ role: z.enum(["owner", "admin", "editor"]), accepted_at: z.string().nullable(), organisation: identity }),
  ),
});

export type Identity = {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  colour: z.infer<typeof colourSchema>;
};

// Members confirm they are 16 or older once; until then they can read but not
// act. A deactivated account waits for a review, then is deleted.
export type AgeStatus = { kind: "confirmed" } | { kind: "unconfirmed" } | { kind: "deactivated"; deletesAt: string };

export type Viewer = Identity & {
  cityId: number | null;
  languages: string[];
  role: "member" | "moderator" | "admin";
  // A ban is a suspension that never ends; suspendedUntil is null for one.
  suspended: boolean;
  suspendedUntil: string | null;
  banned: boolean;
  rulesAccepted: boolean;
  translationLanguage: string | null;
  onboarded: boolean;
  age: AgeStatus;
  organisations: (Identity & { role: "owner" | "admin" | "editor" })[];
  // Teams the person has been asked to join and not yet accepted.
  invitations: (Identity & { role: "owner" | "admin" | "editor" })[];
};

const toIdentity = (row: z.infer<typeof identity>): Identity => ({
  id: row.id,
  username: row.username,
  displayName: row.display_name,
  avatarUrl: row.avatar_url,
  colour: row.colour,
});

// `token` is the mobile app's access token; without it the claims come from
// the session cookie the client was built with.
async function loadViewer(supabase: Supabase, token?: string): Promise<Viewer | null> {
  const { data: claims } = await supabase.auth.getClaims(token);
  const userId = claims?.claims.sub;
  if (!userId) return null;

  const { data } = await supabase
    .from("profiles")
    .select(
      `${IDENTITY}, city_id, languages, profile_settings(site_role, suspended_until, banned_at, rules_accepted_at, translation_language, onboarded_at, age_confirmed_at, age_deactivated_at), organisation_members!organisation_members_user_id_fkey(role, accepted_at, organisation:profiles!organisation_members_org_id_fkey(${IDENTITY}))`,
    )
    .eq("id", userId)
    .maybeSingle();
  if (!data) return null;

  const row = viewerRow.parse(data);
  const settings = row.profile_settings;
  const banned = settings.banned_at !== null;
  const suspendedUntil = !banned && settings.suspended_until !== null && new Date(settings.suspended_until) > new Date() ? settings.suspended_until : null;
  return {
    ...toIdentity(row),
    cityId: row.city_id,
    languages: row.languages,
    role: settings.site_role,
    suspended: banned || suspendedUntil !== null,
    suspendedUntil,
    banned,
    rulesAccepted: settings.rules_accepted_at !== null,
    translationLanguage: settings.translation_language,
    onboarded: settings.onboarded_at !== null,
    age:
      settings.age_deactivated_at !== null
        ? { kind: "deactivated", deletesAt: deletionDate(settings.age_deactivated_at) }
        : settings.age_confirmed_at !== null
          ? { kind: "confirmed" }
          : { kind: "unconfirmed" },
    organisations: row.organisation_members.filter((m) => m.accepted_at !== null).map((m) => ({ ...toIdentity(m.organisation), role: m.role })),
    invitations: row.organisation_members.filter((m) => m.accepted_at === null).map((m) => ({ ...toIdentity(m.organisation), role: m.role })),
  };
}

export const getViewer = cache(async () => loadViewer(await createClient()));

// For API routes the mobile app calls too: the viewer and a client acting as
// them, from a bearer token if the request has one, else from the cookie.
export async function getRequestViewer(request: Request): Promise<{ supabase: Supabase; viewer: Viewer | null }> {
  const given = credentials(request.headers.get("authorization"));
  switch (given.kind) {
    case "cookie":
      return { supabase: await createClient(), viewer: await getViewer() };
    case "bearer": {
      const supabase = createTokenClient(given.token);
      return { supabase, viewer: await loadViewer(supabase, given.token) };
    }
    case "malformed":
      return { supabase: createGuestClient(), viewer: null };
    default: {
      const exhaustive: never = given;
      return exhaustive;
    }
  }
}

export async function requireViewer(next = "/") {
  const viewer = await getViewer();
  if (!viewer) redirect(signInPath(next));
  return viewer;
}

export const isModerator = (viewer: Viewer | null) => viewer?.role === "moderator" || viewer?.role === "admin";
