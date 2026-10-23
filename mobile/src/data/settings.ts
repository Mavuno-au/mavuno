import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { z } from "zod";
import { profileCardSchema, type ProfileCard } from "@/lib/domain";
import { languageSettingsSchema, newOrganisationSchema, passwordChangeSchema, privacySchema } from "@/lib/profile-form";
import { done, fail, failFrom, ok, type Result } from "@/lib/result";
import { emailSchema, firstIssue, usernameSchema } from "@/lib/schemas";
import { siteFetch } from "@/data/api";
import { requestError } from "@/data/errors";
import { updateSettings } from "@/data/profiles";
import { supabase } from "@/data/supabase";

// The website's settings actions (src/app/actions/settings.ts and
// organisations.ts) and loaders (src/lib/data/settings.ts).

const id = z.uuid();
const CARD = "id, username, display_name, avatar_url, colour:effective_colour, account_type, org_verified, headline";
const confirmLink = (next: string) => `https://mavuno.au/auth/confirm?next=${encodeURIComponent(next)}`;

export async function updatePrivacy(viewerId: string, input: z.input<typeof privacySchema>): Promise<Result> {
  const parsed = privacySchema.safeParse(input);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  return updateSettings(viewerId, { dm_policy: parsed.data.dmPolicy, discoverable: parsed.data.discoverable, read_receipts: parsed.data.readReceipts });
}

export async function updateLanguages(viewerId: string, input: z.input<typeof languageSettingsSchema>): Promise<Result> {
  const parsed = languageSettingsSchema.safeParse(input);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const { error } = await supabase.from("profiles").update({ languages: parsed.data.languages }).eq("id", viewerId);
  if (error) return failFrom(error);
  return updateSettings(viewerId, { translation_language: parsed.data.translationLanguage, feed_languages_only: parsed.data.feedLanguagesOnly });
}

export async function changeEmail(email: string, suspended: boolean): Promise<Result> {
  // The database refuses this too; saying so here saves two emails that would fail.
  if (suspended) return fail("Your email can't be changed while your account is suspended.");
  const parsed = emailSchema.safeParse(email);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const { error } = await supabase.auth.updateUser({ email: parsed.data }, { emailRedirectTo: confirmLink("/settings/account") });
  if (error) return fail(error.code === "email_exists" ? "Another account already uses that email." : "We couldn't change your email. Try again.");
  return done;
}

export async function changePassword(password: string, confirm: string): Promise<Result> {
  const parsed = passwordChangeSchema.safeParse({ password, confirm });
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (!error) return done;
  if (error.code === "same_password") return fail("Choose a password you haven't used here.");
  if (error.code === "reauthentication_needed") return fail("Sign in again, then change your password.");
  return fail("We couldn't change your password. Try again.");
}

// GET /api/export, saved to a file and handed to the share sheet.
export async function exportData(): Promise<Result> {
  let data: string;
  try {
    const response = await siteFetch("/api/export");
    if (response.status === 429) return fail("You can download your data three times an hour. Try again later.");
    if (!response.ok) return fail((await response.text()) || "Your data couldn't be prepared. Try again.");
    data = await response.text();
  } catch {
    return fail("Couldn't reach Mavuno. Check your connection and try again.");
  }
  const file = new File(Paths.cache, `mavuno-export-${new Date().toISOString().slice(0, 10)}.json`);
  try {
    if (file.exists) file.delete();
    await file.write(data);
    await Sharing.shareAsync(file.uri, { mimeType: "application/json", dialogTitle: "Your Mavuno data", UTI: "public.json" });
    return done;
  } catch {
    return fail("Your data couldn't be saved or shared. Try again.");
  } finally {
    // It holds everything about the member, and would outlive signing out
    // and even deleting the account. Wherever it was shared has its own copy.
    if (file.exists) file.delete();
  }
}

const relationRows = z.array(z.object({ created_at: z.string(), profile: profileCardSchema }));
export type Relation = { since: string; profile: ProfileCard };

export async function loadSafetyLists(viewerId: string): Promise<{ muted: Relation[]; blocked: Relation[] }> {
  const [mutes, blocks] = await Promise.all([
    supabase.from("mutes").select(`created_at, profile:profiles!mutes_muted_id_fkey(${CARD})`).eq("muter_id", viewerId).order("created_at", { ascending: false }),
    supabase.from("blocks").select(`created_at, profile:profiles!blocks_blocked_id_fkey(${CARD})`).eq("blocker_id", viewerId).order("created_at", { ascending: false }),
  ]);
  if (mutes.error) throw requestError("Muted", mutes.error);
  if (blocks.error) throw requestError("Blocked", blocks.error);
  const toList = (rows: unknown) =>
    relationRows
      .catch([])
      .parse(rows ?? [])
      .map((row) => ({ since: row.created_at, profile: row.profile }));
  return { muted: toList(mutes.data), blocked: toList(blocks.data) };
}

export async function createOrganisation(fields: Record<string, string>): Promise<Result<string>> {
  const parsed = newOrganisationSchema.safeParse(fields);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const input = parsed.data;
  const { error } = await supabase.rpc("create_organisation", {
    p_username: input.username,
    p_display_name: input.name,
    p_bio: input.bio,
    p_category: input.category || null,
    p_city_id: input.cityId,
    p_website: input.website,
  });
  return error ? failFrom(error) : ok(input.username);
}

const teamRole = z.enum(["admin", "editor"]);
export type TeamRole = z.infer<typeof teamRole>;

export async function addTeamMember(orgId: string, username: string, role: TeamRole): Promise<Result> {
  const name = usernameSchema.safeParse(username.replace(/^@/, "").trim().toLowerCase());
  if (!name.success) return fail(firstIssue(name.error));
  const { data: person } = await supabase.from("profiles").select("id, account_type").eq("username", name.data).maybeSingle();
  const found = z.object({ id, account_type: z.literal("person") }).safeParse(person);
  if (!found.success) return fail(`There's no person called @${name.data}.`);
  const { error } = await supabase.from("organisation_members").insert({ org_id: id.parse(orgId), user_id: found.data.id, role: teamRole.parse(role) });
  if (error) return error.code === "23505" ? fail(`@${name.data} is already on the team.`) : failFrom(error);
  return done;
}

export async function setTeamRole(orgId: string, userId: string, role: TeamRole | "owner"): Promise<Result> {
  const { error } = await supabase.rpc("set_organisation_role", { p_org_id: id.parse(orgId), p_user_id: id.parse(userId), p_role: role });
  return error ? failFrom(error) : done;
}

// The new owner is promoted before the current one steps down, so the
// organisation always has an owner.
export async function handOverOwnership(viewerId: string, orgId: string, userId: string): Promise<Result> {
  const promoted = await setTeamRole(orgId, userId, "owner");
  if (!promoted.ok) return promoted;
  return setTeamRole(orgId, viewerId, "admin");
}

export async function removeTeamMember(orgId: string, userId: string): Promise<Result> {
  const { data, error } = await supabase.from("organisation_members").delete().match({ org_id: id.parse(orgId), user_id: id.parse(userId) }).select("user_id");
  if (error) return failFrom(error);
  return data.length > 0 ? done : fail("You can't remove this person.");
}

export async function acceptTeamInvitation(orgId: string): Promise<Result> {
  const { error } = await supabase.rpc("accept_team_invitation", { p_org_id: id.parse(orgId) });
  return error ? failFrom(error) : done;
}

export async function declineTeamInvitation(viewerId: string, orgId: string): Promise<Result> {
  const { error } = await supabase.from("organisation_members").delete().match({ org_id: id.parse(orgId), user_id: viewerId });
  return error ? failFrom(error) : done;
}
