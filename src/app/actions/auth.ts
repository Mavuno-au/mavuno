"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { forgetBirthDate, meetsMinimumAge, readBirthDate } from "@/lib/age-check";
import { emailLink } from "@/lib/email-link";
import { publicEnv } from "@/lib/env";
import { done, fail, type Result } from "@/lib/result";
import { onboardingPath, safeNext } from "@/lib/safe-redirect";
import { emailSchema, firstIssue, passwordSchema, revealsEmail, signInError, signInSchema, usernameSchema } from "@/lib/schemas";
import { createClient } from "@/lib/supabase/server";

// Google sign-in returns here with a one-time code, and the inviter's
// username when it started from someone's invite link.
const callback = (next: string, invite: string | undefined) =>
  `${publicEnv.siteUrl}/auth/callback?next=${encodeURIComponent(next)}${invite ? `&invite=${encodeURIComponent(invite)}` : ""}`;

export async function signUp(_: Result | null, form: FormData): Promise<Result> {
  const parsed = z
    .object({
      email: emailSchema,
      password: passwordSchema,
      username: usernameSchema,
      displayName: z.string().trim().min(1, "Add your name.").max(60),
      next: z.string().optional(),
      invite: usernameSchema.optional().catch(undefined),
    })
    .safeParse(Object.fromEntries(form));
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const { data: input } = parsed;
  if (revealsEmail(input.username, input.email)) return fail("Usernames are public, so yours can't include your email address. Try your name instead.");
  const setup = onboardingPath(safeNext(input.next));

  const supabase = await createClient();
  const birthDate = await readBirthDate();
  if (!birthDate) return fail("Enter your date of birth first. Reload the page to start again.");
  const oldEnough = await meetsMinimumAge(supabase, birthDate);
  if (oldEnough === null) return fail("We couldn't check your details. Try again.");
  if (!oldEnough) return fail("Enter your date of birth first. Reload the page to start again.");
  // The database gives a reserved name a generated one instead, so it is
  // refused here, where the person can choose again.
  const [{ data: taken }, { data: reserved }] = await Promise.all([
    supabase.from("profiles").select("id").eq("username", input.username).maybeSingle(),
    supabase.rpc("is_reserved_username", { p_username: input.username }),
  ]);
  if (taken) return fail("That username is taken.");
  if (reserved === true) return fail("That username is reserved for Mavuno. Choose another.");

  // Only the outcome of the age check goes with the account, never the date.
  // The inviter is recorded once the email address is confirmed.
  const { data, error } = await supabase.auth.signUp({
    email: input.email,
    password: input.password,
    options: {
      emailRedirectTo: emailLink(setup),
      data: { username: input.username, display_name: input.displayName, age_confirmed: true, ...(input.invite ? { invited_by: input.invite } : {}) },
    },
  });
  if (error?.code === "user_already_exists") return fail("An account with that email already exists. Sign in instead.");
  if (error?.status === 429) return fail("We're sending a lot of sign-up emails right now. Wait a few minutes and try again.");
  // public.handle_new_user stops the sign-up when someone took the name a moment ago.
  if (error && (await supabase.from("profiles").select("id").eq("username", input.username).maybeSingle()).data) return fail("Someone just took that username. Choose another.");
  if (error) return fail(error.message);
  await forgetBirthDate();
  if (data.session) redirect(setup);
  // Never the address itself: analytics and logs record full URLs.
  redirect("/login?sent=confirm");
}

export async function signIn(_: Result | null, form: FormData): Promise<Result> {
  const parsed = signInSchema.extend({ next: z.string().optional() }).safeParse(Object.fromEntries(form));
  if (!parsed.success) return fail(firstIssue(parsed.error));

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email: parsed.data.email, password: parsed.data.password });
  if (error) return fail(signInError(error.code));
  redirect(safeNext(parsed.data.next));
}

export async function sendMagicLink(_: Result | null, form: FormData): Promise<Result> {
  const parsed = z.object({ email: emailSchema, next: z.string().optional() }).safeParse(Object.fromEntries(form));
  if (!parsed.success) return fail(firstIssue(parsed.error));

  const supabase = await createClient();
  // Signing in only: joining goes through the sign-up form and its age question.
  const { error } = await supabase.auth.signInWithOtp({ email: parsed.data.email, options: { emailRedirectTo: emailLink(safeNext(parsed.data.next)), shouldCreateUser: false } });
  if (error?.status === 429) return fail("Too many emails. Wait a minute and try again.");
  if (error && (!error.status || error.status >= 500)) return fail("We couldn't send the link. Try again.");
  // An address with no account gets the same answer, so the form doesn't tell who has one.
  return done;
}

export async function signInWithGoogle(form: FormData) {
  const supabase = await createClient();
  const invite = usernameSchema.safeParse(form.get("invite")).data;
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: callback(safeNext(form.get("next")), invite) },
  });
  if (error || !data.url) redirect("/login?error=google");
  redirect(data.url);
}

export async function requestPasswordReset(_: Result | null, form: FormData): Promise<Result> {
  const parsed = emailSchema.safeParse(form.get("email"));
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data, { redirectTo: emailLink("/reset-password") });
  if (error?.status === 429) return fail("We're sending a lot of emails right now. Wait a few minutes and try again.");
  // Same answer whether or not the account exists.
  return done;
}

export async function updatePassword(_: Result | null, form: FormData): Promise<Result> {
  const parsed = passwordSchema.safeParse(form.get("password"));
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data });
  if (error) return fail(error.code === "same_password" ? "Choose a password you haven't used here." : "Your reset link has expired. Request a new one.");
  redirect("/");
}

export async function signOut() {
  const supabase = await createClient();
  // Signing out ends every session, so no phone should keep getting this member's pushes either.
  await supabase.rpc("unregister_my_push_tokens");
  await supabase.auth.signOut();
  redirect("/");
}
