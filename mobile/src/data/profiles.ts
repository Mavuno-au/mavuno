import { z } from "zod";
import { PROFILE_COLUMNS, profileRowSchema, type ProfileRow } from "@/lib/domain";
import { done, failFrom, type Result } from "@/lib/result";
import { supabase } from "@/data/supabase";

// What the profile header says about the viewer and this profile, as the
// website's loadProfile (src/lib/data/profiles.ts) works it out.
export type Relationship = {
  self: boolean;
  following: boolean;
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
  if (profile.id === viewerId) return { kind: "profile", profile, relationship: { self: true, following: false, followsYou: false, muted: false, invite: null } };

  const [following, followsYou, muted, blockedByViewer, blockedEitherWay, invites] = await Promise.all([
    supabase.from("follows").select("follower_id").match({ follower_id: viewerId, followee_id: profile.id }).maybeSingle(),
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
  return { kind: "profile", profile, relationship: { self: false, following: Boolean(following.data), followsYou: Boolean(followsYou.data), muted: Boolean(muted.data), invite } };
}

// The follow half of the website's setRelation (src/app/actions/social.ts):
// one row the viewer owns, which row level security lets only them write.
// Mutes and blocks will be written the same way.
export async function setFollow(viewerId: string, profileId: string, on: boolean): Promise<Result> {
  const row = { follower_id: viewerId, followee_id: z.uuid().parse(profileId) };
  const { error } = on
    ? await supabase.from("follows").upsert(row, { onConflict: "follower_id,followee_id", ignoreDuplicates: true })
    : await supabase.from("follows").delete().match(row);
  return error ? failFrom(error) : done;
}
