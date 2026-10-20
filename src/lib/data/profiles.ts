import "server-only";
import { cache } from "react";
import { z } from "zod";
import { accountTypeSchema, colourSchema, parsePeople, postRowSchema, type PersonSummary } from "@/lib/domain";
import { createClient } from "@/lib/supabase/server";
import type { Viewer } from "@/lib/viewer";

const linkSchema = z.object({ label: z.string(), url: z.string() });

const profileRow = z.object({
  id: z.uuid(),
  account_type: accountTypeSchema,
  username: z.string(),
  display_name: z.string(),
  bio: z.string(),
  avatar_url: z.string().nullable(),
  banner_url: z.string().nullable(),
  colour: colourSchema,
  heritage: z.string().nullable(),
  pronouns: z.string().nullable(),
  interests: z.array(z.string()),
  languages: z.array(z.string()),
  website: z.string().nullable(),
  links: z.array(linkSchema).catch([]),
  headline: z.string().nullable(),
  occupation: z.string().nullable(),
  company: z.string().nullable(),
  industry: z.string().nullable(),
  open_to: z.array(z.string()),
  org_category: z.string().nullable(),
  org_verified: z.boolean(),
  pinned_post_id: z.uuid().nullable(),
  followers_count: z.number(),
  following_count: z.number(),
  posts_count: z.number(),
  created_at: z.string(),
  city: z.object({ name: z.string(), state: z.string(), slug: z.string() }).nullable(),
});

const teamRow = z.array(
  z.object({
    role: z.enum(["owner", "admin", "editor"]),
    person: z.object({ id: z.uuid(), username: z.string(), display_name: z.string(), avatar_url: z.string().nullable(), colour: colourSchema }),
  }),
);

export type Relationship = { following: boolean; followsYou: boolean; muted: boolean; canMessage: boolean; self: boolean };

export type Profile = z.infer<typeof profileRow> & { relationship: Relationship };

export type ProfilePage =
  | { kind: "missing" }
  | { kind: "unavailable"; username: string; blockedByViewer: boolean; id: string }
  | { kind: "profile"; profile: Profile };

const SELECT =
  "id, account_type, username, display_name, bio, avatar_url, banner_url, colour:effective_colour, heritage, pronouns, interests, languages, website, links, headline, occupation, company, industry, open_to, org_category, org_verified, pinned_post_id, followers_count, following_count, posts_count, created_at, city:cities(name, state, slug)";

// Cached per request: metadata and the page both ask for the same profile.
export const loadProfile = cache(async (username: string, viewer: Viewer | null): Promise<ProfilePage> => {
  const supabase = await createClient();
  const { data } = await supabase.from("profiles").select(SELECT).eq("username", username.toLowerCase()).maybeSingle();
  if (!data) return { kind: "missing" };
  const row = profileRow.parse(data);
  const self = viewer?.id === row.id;

  if (!viewer || self) {
    return { kind: "profile", profile: { ...row, relationship: { following: false, followsYou: false, muted: false, canMessage: false, self } } };
  }

  const [following, followsYou, muted, blockedByViewer, blockedEitherWay, canMessage] = await Promise.all([
    supabase.from("follows").select("follower_id").match({ follower_id: viewer.id, followee_id: row.id }).maybeSingle(),
    supabase.from("follows").select("follower_id").match({ follower_id: row.id, followee_id: viewer.id }).maybeSingle(),
    supabase.from("mutes").select("muter_id").match({ muter_id: viewer.id, muted_id: row.id }).maybeSingle(),
    supabase.from("blocks").select("blocker_id").match({ blocker_id: viewer.id, blocked_id: row.id }).maybeSingle(),
    supabase.rpc("is_blocked_with_viewer", { p_profile_id: row.id }),
    supabase.rpc("can_message", { p_user_id: row.id }),
  ]);

  if (blockedEitherWay.data === true) return { kind: "unavailable", username: row.username, blockedByViewer: Boolean(blockedByViewer.data), id: row.id };

  return {
    kind: "profile",
    profile: {
      ...row,
      relationship: { following: Boolean(following.data), followsYou: Boolean(followsYou.data), muted: Boolean(muted.data), canMessage: canMessage.data === true, self },
    },
  };
});

export async function loadPinnedPost(postId: string | null) {
  if (!postId) return null;
  const supabase = await createClient();
  const { data } = await supabase.from("post_details").select("*").eq("id", postId).maybeSingle();
  if (!data) return null;
  const post = postRowSchema.parse(data);
  return post.kind === "post" && post.status === "published" ? post : null;
}

export async function loadTeam(orgId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("organisation_members")
    .select("role, person:profiles!organisation_members_user_id_fkey(id, username, display_name, avatar_url, colour:effective_colour)")
    .eq("org_id", orgId)
    .order("created_at");
  return teamRow.parse(data ?? []).map(({ role, person }) => ({
    role,
    id: person.id,
    username: person.username,
    displayName: person.display_name,
    avatarUrl: person.avatar_url,
    colour: person.colour,
  }));
}

const CONNECTIONS_PAGE = 50;

const connectionRows = z.array(z.object({ created_at: z.string(), person: z.unknown() }));

export type Direction = "followers" | "following";

// `next` is the follow time to continue from, or null at the end.
export type ConnectionsPage = { people: PersonSummary[]; next: string | null };

// People who follow the profile ("followers") or whom it follows ("following"),
// newest follow first, leaving out accounts the viewer has blocked.
export async function loadConnections(profileId: string, direction: Direction, viewer: Viewer | null, before: string | null = null): Promise<ConnectionsPage> {
  const supabase = await createClient();
  const relation =
    direction === "followers"
      ? "person:profiles!follows_follower_id_fkey(id, username, display_name, avatar_url, colour:effective_colour, bio, headline, account_type, org_verified, followers_count)"
      : "person:profiles!follows_followee_id_fkey(id, username, display_name, avatar_url, colour:effective_colour, bio, headline, account_type, org_verified, followers_count)";
  let query = supabase
    .from("follows")
    .select(`created_at, ${relation}`)
    .eq(direction === "followers" ? "followee_id" : "follower_id", profileId)
    .order("created_at", { ascending: false })
    .limit(CONNECTIONS_PAGE);
  if (before) query = query.lt("created_at", before);
  const { data } = await query;
  const rows = connectionRows.parse(data ?? []);
  const people = parsePeople(rows.map((row) => row.person));
  const next = rows.length === CONNECTIONS_PAGE ? (rows.at(-1)?.created_at ?? null) : null;
  if (!viewer || people.length === 0) return { people, next };

  // Either side of a block: people the viewer blocked and people who blocked the viewer.
  const { data: blockedIds } = await supabase.rpc("blocked_with_viewer", { p_profile_ids: people.map((person) => person.id) });
  const blocked = new Set(z.array(z.string()).catch([]).parse(blockedIds ?? []));
  return { people: await withFollowing(people.filter((person) => !blocked.has(person.id)), viewer), next };
}

// Fills in whether the viewer follows each person, for lists that don't know.
export async function withFollowing(people: PersonSummary[], viewer: Viewer | null): Promise<PersonSummary[]> {
  if (!viewer || people.length === 0) return people;
  const supabase = await createClient();
  const { data } = await supabase.from("follows").select("followee_id").eq("follower_id", viewer.id).in("followee_id", people.map((person) => person.id));
  const followed = new Set(z.array(z.object({ followee_id: z.string() })).parse(data ?? []).map((row) => row.followee_id));
  return people.map((person) => ({ ...person, following: followed.has(person.id) }));
}

const knownFollowerRows = z.array(
  z.object({ id: z.uuid(), username: z.string(), display_name: z.string(), avatar_url: z.string().nullable(), colour: colourSchema, total: z.coerce.number() }),
);

export type FollowersYouKnow = { people: { id: string; username: string; displayName: string; avatarUrl: string | null; colour: Profile["colour"] }[]; total: number };

// People the viewer follows who follow this profile. Null when there are none to show.
export async function loadFollowersYouKnow(profileId: string, viewer: Viewer | null): Promise<FollowersYouKnow | null> {
  if (!viewer || viewer.id === profileId) return null;
  const supabase = await createClient();
  const { data } = await supabase.rpc("followers_you_know", { p_profile_id: profileId, p_limit: 3 });
  const rows = knownFollowerRows.parse(data ?? []);
  const total = rows[0]?.total ?? 0;
  if (total === 0) return null;
  return {
    total,
    people: rows.map((row) => ({ id: row.id, username: row.username, displayName: row.display_name, avatarUrl: row.avatar_url, colour: row.colour })),
  };
}
