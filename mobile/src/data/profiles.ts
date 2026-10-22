import { z } from "zod";
import { PROFILE_COLUMNS, profileRowSchema, type ProfileRow } from "@/lib/domain";
import { supabase } from "@/data/supabase";

// What the profile header says about the viewer and this profile, as the
// website's loadProfile (src/lib/data/profiles.ts) works it out.
export type Relationship = {
  self: boolean;
  followsYou: boolean;
  muted: boolean;
  // Who invited whom is shown only to the two people (invites' row level security).
  invite: "invited_you" | "you_invited" | null;
};

export type ProfilePage =
  | { kind: "missing" }
  | { kind: "unavailable"; username: string; blockedByViewer: boolean }
  | { kind: "profile"; profile: ProfileRow; relationship: Relationship };

const inviteRows = z.array(z.object({ member_id: z.uuid(), invited_by: z.uuid().nullable() }));

export async function loadProfile(username: string, viewerId: string): Promise<ProfilePage> {
  const { data, error } = await supabase.from("profiles").select(PROFILE_COLUMNS).eq("username", username.toLowerCase()).maybeSingle();
  if (error) throw new Error(`Profile failed: ${error.message}`);
  if (!data) return { kind: "missing" };
  const profile = profileRowSchema.parse(data);
  if (profile.id === viewerId) return { kind: "profile", profile, relationship: { self: true, followsYou: false, muted: false, invite: null } };

  const [followsYou, muted, blockedByViewer, blockedEitherWay, invites] = await Promise.all([
    supabase.from("follows").select("follower_id").match({ follower_id: profile.id, followee_id: viewerId }).maybeSingle(),
    supabase.from("mutes").select("muter_id").match({ muter_id: viewerId, muted_id: profile.id }).maybeSingle(),
    supabase.from("blocks").select("blocker_id").match({ blocker_id: viewerId, blocked_id: profile.id }).maybeSingle(),
    supabase.rpc("is_blocked_with_viewer", { p_profile_id: profile.id }),
    supabase.from("invites").select("member_id, invited_by").or(`member_id.eq.${profile.id},invited_by.eq.${profile.id}`),
  ]);
  if (blockedEitherWay.data === true) return { kind: "unavailable", username: profile.username, blockedByViewer: Boolean(blockedByViewer.data) };

  const between = inviteRows.catch([]).parse(invites.data ?? []);
  const invite = between.some((entry) => entry.member_id === viewerId && entry.invited_by === profile.id)
    ? "invited_you"
    : between.some((entry) => entry.member_id === profile.id && entry.invited_by === viewerId)
      ? "you_invited"
      : null;
  return { kind: "profile", profile, relationship: { self: false, followsYou: Boolean(followsYou.data), muted: Boolean(muted.data), invite } };
}
