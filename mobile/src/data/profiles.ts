import { z } from "zod";
import { colourSchema, parsePeople, PROFILE_COLUMNS, profileCardSchema, profileRowSchema, type PersonSummary, type ProfileRow } from "@/lib/domain";
import { EDITABLE, editableRow, profileSchema, SETTINGS_COLUMNS, settingsRow, type ProfileChanges } from "@/lib/profile-form";
import { done, fail, failFrom, ok, type Result } from "@/lib/result";
import { firstIssue, usernameSchema } from "@/lib/schemas";
import { requestError } from "@/data/errors";
import { MEDIA_URL } from "@/data/posts";
import { supabase } from "@/data/supabase";

// What the profile header says about the viewer and this profile, as the
// website's loadProfile (src/lib/data/profiles.ts) works it out.
export type Relationship = {
  self: boolean;
  following: boolean;
  followsYou: boolean;
  muted: boolean;
  canMessage: boolean;
  // Who invited whom is shown only to the two people (invites' row level security).
  invite: "invited_you" | "you_invited" | null;
};

export type ProfilePage =
  | { kind: "missing" }
  | { kind: "unavailable"; id: string; username: string; blockedByViewer: boolean }
  | { kind: "profile"; profile: ProfileRow; relationship: Relationship };

const inviteRows = z.array(z.object({ member_id: z.uuid(), invited_by: z.uuid().nullable() }));

export async function loadProfile(username: string, viewerId: string): Promise<ProfilePage> {
  const { data, error } = await supabase.from("profiles").select(PROFILE_COLUMNS).eq("username", username.toLowerCase()).maybeSingle();
  if (error) throw requestError("Profile", error);
  if (!data) return { kind: "missing" };
  const profile = profileRowSchema.parse(data);
  if (profile.id === viewerId) return { kind: "profile", profile, relationship: { self: true, following: false, followsYou: false, muted: false, canMessage: false, invite: null } };

  const [following, followsYou, muted, blockedByViewer, blockedEitherWay, canMessage, invites] = await Promise.all([
    supabase.from("follows").select("follower_id").match({ follower_id: viewerId, followee_id: profile.id }).maybeSingle(),
    supabase.from("follows").select("follower_id").match({ follower_id: profile.id, followee_id: viewerId }).maybeSingle(),
    supabase.from("mutes").select("muter_id").match({ muter_id: viewerId, muted_id: profile.id }).maybeSingle(),
    supabase.from("blocks").select("blocker_id").match({ blocker_id: viewerId, blocked_id: profile.id }).maybeSingle(),
    supabase.rpc("is_blocked_with_viewer", { p_profile_id: profile.id }),
    supabase.rpc("can_message", { p_user_id: profile.id }),
    supabase.from("invites").select("member_id, invited_by").or(`member_id.eq.${profile.id},invited_by.eq.${profile.id}`),
  ]);
  if (blockedEitherWay.error) throw requestError("Profile", blockedEitherWay.error);
  if (blockedEitherWay.data === true) return { kind: "unavailable", id: profile.id, username: profile.username, blockedByViewer: Boolean(blockedByViewer.data) };

  const between = inviteRows.catch([]).parse(invites.data ?? []);
  const invite = between.some((entry) => entry.member_id === viewerId && entry.invited_by === profile.id)
    ? "invited_you"
    : between.some((entry) => entry.member_id === profile.id && entry.invited_by === viewerId)
      ? "you_invited"
      : null;
  return {
    kind: "profile",
    profile,
    relationship: { self: false, following: Boolean(following.data), followsYou: Boolean(followsYou.data), muted: Boolean(muted.data), canMessage: canMessage.data === true, invite },
  };
}

// The follow half of the website's setRelation (src/app/actions/social.ts):
// one row the viewer owns, which row level security lets only them write.
export async function setFollow(viewerId: string, profileId: string, on: boolean): Promise<Result> {
  const row = { follower_id: viewerId, followee_id: z.uuid().parse(profileId) };
  const { error } = on ? await supabase.from("follows").upsert(row, { onConflict: "follower_id,followee_id", ignoreDuplicates: true }) : await supabase.from("follows").delete().match(row);
  return error ? failFrom(error) : done;
}

const person = z.object({ id: z.uuid(), username: z.string(), display_name: z.string(), avatar_url: z.string().nullable(), colour: colourSchema });
const teamRows = z.array(z.object({ role: z.enum(["owner", "admin", "editor"]), accepted_at: z.string().nullable(), person }));
export type TeamMember = { id: string; username: string; displayName: string; avatarUrl: string | null; colour: z.infer<typeof colourSchema>; role: "owner" | "admin" | "editor"; invited: boolean };

// An organisation's team, owners first as the database lists them.
export async function loadTeam(orgId: string): Promise<TeamMember[]> {
  const { data, error } = await supabase
    .from("organisation_members")
    .select("role, accepted_at, person:profiles!organisation_members_user_id_fkey(id, username, display_name, avatar_url, colour:effective_colour)")
    .eq("org_id", orgId)
    .order("created_at");
  if (error) throw requestError("Team", error);
  return teamRows
    .catch([])
    .parse(data ?? [])
    .map(({ role, accepted_at, person: member }) => ({ role, invited: accepted_at === null, id: member.id, username: member.username, displayName: member.display_name, avatarUrl: member.avatar_url, colour: member.colour }));
}

const knownRows = z.array(person.extend({ total: z.coerce.number() }));
export type FollowersYouKnow = { people: { id: string; username: string; displayName: string; avatarUrl: string | null; colour: z.infer<typeof colourSchema> }[]; total: number };

// People the viewer follows who follow this profile. Null when there are none.
export async function loadFollowersYouKnow(profileId: string): Promise<FollowersYouKnow | null> {
  const { data } = await supabase.rpc("followers_you_know", { p_profile_id: profileId, p_limit: 3 });
  const rows = knownRows.catch([]).parse(data ?? []);
  const total = rows[0]?.total ?? 0;
  if (total === 0) return null;
  return { total, people: rows.map((row) => ({ id: row.id, username: row.username, displayName: row.display_name, avatarUrl: row.avatar_url, colour: row.colour })) };
}

export type Direction = "followers" | "following";
const CONNECTIONS_PAGE = 30;

export async function loadConnections(profileId: string, direction: Direction, cursor: string | null): Promise<{ items: PersonSummary[]; next: string | null }> {
  const after = cursor ? { before: cursor.slice(0, -37), beforeId: cursor.slice(-36) } : null;
  const { data, error } = await supabase.rpc("profile_connections", { p_profile_id: profileId, p_direction: direction, p_before: after?.before ?? null, p_before_id: after?.beforeId ?? null, p_limit: CONNECTIONS_PAGE });
  if (error) throw requestError("Connections", error);
  const rows = z.array(z.object({ followed_at: z.string() })).parse(data ?? []);
  const people = parsePeople(data);
  const last = rows.at(-1);
  const lastPerson = people.at(-1);
  return { items: people, next: rows.length === CONNECTIONS_PAGE && last && lastPerson ? `${last.followed_at}:${lastPerson.id}` : null };
}

// The people who joined from the viewer's invite. Only the two of them can see it.
export async function loadInvitees(viewerId: string) {
  const { data, error } = await supabase
    .from("invites")
    .select("created_at, member:profiles!invites_member_id_fkey(id, username, display_name, avatar_url, colour:effective_colour, account_type, org_verified)")
    .eq("invited_by", viewerId)
    .order("created_at", { ascending: false });
  if (error) throw requestError("Invites", error);
  return z
    .array(z.object({ created_at: z.string(), member: profileCardSchema.nullable() }))
    .catch([])
    .parse(data ?? [])
    .flatMap((row) => (row.member ? [{ ...row.member, joinedAt: row.created_at }] : []));
}

export type EditableProfile = z.infer<typeof editableRow>;

export async function loadEditableProfile(profileId: string): Promise<EditableProfile | null> {
  const { data, error } = await supabase.from("profiles").select(EDITABLE).eq("id", profileId).maybeSingle();
  if (error) throw requestError("Profile", error);
  return data ? editableRow.parse(data) : null;
}

// The website's updateProfile: the viewer's own profile or an organisation's
// they help run; row level security decides which.
export async function updateProfile(profileId: string, changes: ProfileChanges): Promise<Result> {
  const parsed = profileSchema.safeParse(changes);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const { data, error } = await supabase.from("profiles").update(parsed.data).eq("id", z.uuid().parse(profileId)).select("id");
  if (error) return failFrom(error);
  return data.length > 0 ? done : fail("You can't edit this profile.");
}

export async function checkUsername(username: string): Promise<Result<{ available: boolean }>> {
  const parsed = usernameSchema.safeParse(username);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const [{ data: taken }, { data: reserved }] = await Promise.all([
    supabase.from("profiles").select("id").eq("username", parsed.data).maybeSingle(),
    supabase.rpc("is_reserved_username", { p_username: parsed.data }),
  ]);
  return ok({ available: !taken && reserved !== true });
}

const mediaPath = (url: string | null) => (url?.startsWith(MEDIA_URL) ? url.slice(MEDIA_URL.length) : null);

// The website's setProfileImage: point the profile at the new file, then
// remove the one it replaced.
export async function setProfileImage(profileId: string, kind: "avatar" | "banner", url: string | null): Promise<Result> {
  if (url && !mediaPath(url)) return fail("That image can't be used.");
  const column = kind === "avatar" ? "avatar_url" : "banner_url";
  const { data: before } = await supabase.from("profiles").select(`url:${column}`).eq("id", profileId).maybeSingle();
  const { data, error } = await supabase.from("profiles").update({ [column]: url }).eq("id", profileId).select("id");
  if (error) return failFrom(error);
  if (!data.length) return fail("You can't edit this profile.");
  const previous = mediaPath(z.object({ url: z.string().nullable() }).catch({ url: null }).parse(before).url);
  if (previous && previous !== mediaPath(url)) await supabase.storage.from("media").remove([previous]);
  return done;
}

export type PrivateSettings = z.infer<typeof settingsRow>;

export async function loadPrivateSettings(viewerId: string): Promise<PrivateSettings> {
  const { data, error } = await supabase.from("profile_settings").select(SETTINGS_COLUMNS).eq("id", viewerId).single();
  if (error) throw requestError("Settings", error);
  return settingsRow.parse(data);
}

export async function updateSettings(viewerId: string, changes: Record<string, unknown>): Promise<Result> {
  const { error } = await supabase.from("profile_settings").update(changes).eq("id", viewerId);
  return error ? failFrom(error) : done;
}

const cityRow = z.object({ id: z.number(), slug: z.string(), name: z.string(), state: z.string() });
export type City = z.infer<typeof cityRow>;

let cities: Promise<City[]> | null = null;

// The cities a profile, space or event can be in. Read once per launch.
export function loadCities(): Promise<City[]> {
  cities ??= Promise.resolve(supabase.from("cities").select("id, slug, name, state").order("name")).then(({ data, error }) => {
    if (error) {
      cities = null;
      throw requestError("Cities", error);
    }
    return z.array(cityRow).parse(data ?? []);
  });
  return cities;
}
