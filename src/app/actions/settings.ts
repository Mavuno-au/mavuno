"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { done, fail, failFrom, ok, type Result } from "@/lib/result";
import { emailSchema, firstIssue, usernameSchema } from "@/lib/schemas";
import { languageSettingsSchema, passwordChangeSchema, privacySchema, profileSchema, type ProfileChanges } from "@/lib/profile-form";
import { mediaPath, removeProfileMedia, soleOwnedOrganisations } from "@/lib/data/settings";
import { createClient, type Supabase } from "@/lib/supabase/server";
import { getViewer } from "@/lib/viewer";
import { safeNext } from "@/lib/safe-redirect";
import { emailLink } from "@/lib/email-link";

const id = z.uuid();

export type { ProfileChanges } from "@/lib/profile-form";

// Works for the viewer's own profile and for organisations they help run;
// row level security decides which.
export async function updateProfile(profileId: string, changes: ProfileChanges): Promise<Result> {
  const parsed = profileSchema.safeParse(changes);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const supabase = await createClient();
  const { data, error } = await supabase.from("profiles").update(parsed.data).eq("id", id.parse(profileId)).select("id");
  if (error) return failFrom(error);
  if (!data?.length) return fail("You can't edit this profile.");
  refresh();
  return done;
}

export async function checkUsername(username: string): Promise<Result<{ available: boolean }>> {
  const parsed = usernameSchema.safeParse(username);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const supabase = await createClient();
  const [{ data: taken }, { data: reserved }] = await Promise.all([
    supabase.from("profiles").select("id").eq("username", parsed.data).maybeSingle(),
    supabase.rpc("is_reserved_username", { p_username: parsed.data }),
  ]);
  return ok({ available: !taken && reserved !== true });
}

const imageSchema = z.object({ profileId: id, kind: z.enum(["avatar", "banner"]), url: z.url().nullable() });

// The upload happens in the browser; this points the profile at the new file
// and removes the one it replaces.
export async function setProfileImage(input: z.input<typeof imageSchema>): Promise<Result> {
  const parsed = imageSchema.safeParse(input);
  if (!parsed.success || (parsed.data.url && !mediaPath(parsed.data.url))) return fail("That image can't be used.");
  const { profileId, kind, url } = parsed.data;
  const column = kind === "avatar" ? "avatar_url" : "banner_url";
  const supabase = await createClient();
  const { data: before } = await supabase.from("profiles").select(`url:${column}`).eq("id", profileId).maybeSingle();
  const { data, error } = await supabase.from("profiles").update({ [column]: url }).eq("id", profileId).select("id");
  if (error) return failFrom(error);
  if (!data?.length) return fail("You can't edit this profile.");
  const previous = mediaPath(z.object({ url: z.string().nullable() }).catch({ url: null }).parse(before).url);
  if (previous) await supabase.storage.from("media").remove([previous]);
  refresh();
  return done;
}

async function updateSettings(supabase: Supabase, viewerId: string, changes: Record<string, unknown>) {
  const { error } = await supabase.from("profile_settings").update(changes).eq("id", viewerId);
  return error ? failFrom(error) : done;
}

export async function updatePrivacy(input: z.input<typeof privacySchema>): Promise<Result> {
  const viewer = await getViewer();
  if (!viewer) return fail("Sign in first.");
  const parsed = privacySchema.parse(input);
  const supabase = await createClient();
  return updateSettings(supabase, viewer.id, { dm_policy: parsed.dmPolicy, discoverable: parsed.discoverable, read_receipts: parsed.readReceipts });
}

export async function updateLanguages(input: z.input<typeof languageSettingsSchema>): Promise<Result> {
  const viewer = await getViewer();
  if (!viewer) return fail("Sign in first.");
  const parsed = languageSettingsSchema.safeParse(input);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const supabase = await createClient();
  const { error } = await supabase.from("profiles").update({ languages: parsed.data.languages }).eq("id", viewer.id);
  if (error) return failFrom(error);
  const result = await updateSettings(supabase, viewer.id, {
    translation_language: parsed.data.translationLanguage,
    feed_languages_only: parsed.data.feedLanguagesOnly,
  });
  refresh();
  return result;
}

export async function changeEmail(_: Result | null, form: FormData): Promise<Result> {
  const viewer = await getViewer();
  if (!viewer) return fail("Sign in first.");
  // The database refuses this too; saying so here saves two confirmation emails that would fail.
  if (viewer.suspended) return fail("Your email can't be changed while your account is suspended.");
  const parsed = emailSchema.safeParse(form.get("email"));
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ email: parsed.data }, { emailRedirectTo: emailLink("/settings/account") });
  if (error) return fail(error.code === "email_exists" ? "Another account already uses that email." : "We couldn't change your email. Try again.");
  return done;
}

export async function changePassword(_: Result | null, form: FormData): Promise<Result> {
  const parsed = passwordChangeSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (!error) return done;
  if (error.code === "same_password") return fail("Choose a password you haven't used here.");
  if (error.code === "reauthentication_needed") return fail("Sign in again, then change your password.");
  return fail("We couldn't change your password. Try again.");
}

export async function joinSpaces(spaceIds: string[]): Promise<Result> {
  const viewer = await getViewer();
  if (!viewer) return fail("Sign in first.");
  const ids = z.array(id).max(40).parse(spaceIds);
  if (ids.length === 0) return done;
  const supabase = await createClient();
  const { error } = await supabase
    .from("space_members")
    .upsert(ids.map((spaceId) => ({ space_id: spaceId, user_id: viewer.id })), { onConflict: "space_id,user_id", ignoreDuplicates: true });
  return error ? failFrom(error) : done;
}

export async function finishOnboarding(next: unknown): Promise<Result> {
  const viewer = await getViewer();
  if (!viewer) return fail("Sign in first.");
  const supabase = await createClient();
  const result = await updateSettings(supabase, viewer.id, { onboarded_at: new Date().toISOString() });
  if (!result.ok) return result;
  redirect(safeNext(next));
}

export async function deleteAccount(_: Result | null, form: FormData): Promise<Result> {
  const viewer = await getViewer();
  if (!viewer) return fail("Sign in first.");
  const confirm = z.string().trim().toLowerCase().safeParse(form.get("confirm"));
  if (confirm.data !== viewer.username) return fail(`Type ${viewer.username} to confirm.`);

  const supabase = await createClient();
  await removeProfileMedia([viewer.id, ...(await soleOwnedOrganisations(viewer))]);

  const { error } = await supabase.rpc("delete_my_account");
  if (error) return failFrom(error);
  await supabase.auth.signOut({ scope: "local" });
  redirect("/deleted");
}
