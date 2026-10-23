import * as SecureStore from "expo-secure-store";
import { z } from "zod";
import { profileCardSchema, type ProfileCard } from "@/lib/domain";
import { done, fail, ok, type Result } from "@/lib/result";
import { emailSchema, firstIssue, passwordSchema, revealsEmail, usernameSchema } from "@/lib/schemas";
import { siteLink } from "@/data/env";
import type { Reason } from "@/data/errors";
import { supabase } from "@/data/supabase";

// Joining, as docs/MOBILE_API.md describes: the age question first, then the
// account. The date of birth stays in memory and never reaches storage; only
// the outcome goes with the account.

const confirmLink = (next: string) => siteLink(`/auth/confirm?next=${encodeURIComponent(next)}`);

// Someone who said they're under 16 sees that screen again for a day, as the
// website's mavuno-under-16 cookie does. No date, nothing personal.
const UNDER_16 = "mavuno-under-16";
const DAY = 24 * 60 * 60 * 1000;

export async function rememberUnder16() {
  await SecureStore.setItemAsync(UNDER_16, String(Date.now() + DAY));
}

export async function saidUnder16Recently() {
  const until = Number((await SecureStore.getItemAsync(UNDER_16).catch(() => null)) ?? 0);
  return until > Date.now();
}

// Kept only until the account exists, then dropped.
let birthDate: string | null = null;
let invitedBy: string | null = null;

export const joining = {
  get birthDate() {
    return birthDate;
  },
  get invitedBy() {
    return invitedBy;
  },
  start(date: string, invite: string | null) {
    birthDate = date;
    invitedBy = invite;
  },
  forget() {
    birthDate = null;
    invitedBy = null;
  },
};

// The rule lives only in the database; guests may ask.
export async function meetsMinimumAge(date: string): Promise<boolean | null> {
  const { data, error } = await supabase.rpc("meets_minimum_age", { p_birth_date: date });
  if (error) return null;
  return data === true;
}

// For a member who reached the app without a confirmed age. False means the
// database has deactivated the account and recorded the step.
export async function confirmAge(date: string): Promise<Result<boolean>> {
  const { data, error } = await supabase.rpc("confirm_age", { p_birth_date: date });
  if (error) return fail(error.message);
  return ok(data === true);
}

const signUpSchema = z.object({ email: emailSchema, password: passwordSchema, username: usernameSchema, displayName: z.string().trim().min(1, "Add your name.").max(60) });

// The website's signUp (src/app/actions/auth.ts): its checks, its messages.
export async function signUp(input: z.input<typeof signUpSchema>): Promise<Result<{ confirmed: boolean }>> {
  const parsed = signUpSchema.safeParse(input);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const form = parsed.data;
  if (revealsEmail(form.username, form.email)) return fail("Usernames are public, so yours can't include your email address. Try your name instead.");
  if (!birthDate || (await meetsMinimumAge(birthDate)) !== true) return fail("Enter your date of birth first. Go back to start again.");
  const [{ data: taken }, { data: reserved }] = await Promise.all([
    supabase.from("profiles").select("id").eq("username", form.username).maybeSingle(),
    supabase.rpc("is_reserved_username", { p_username: form.username }),
  ]);
  if (taken) return fail("That username is taken.");
  if (reserved === true) return fail("That username is reserved for Mavuno. Choose another.");
  const { data, error } = await supabase.auth.signUp({
    email: form.email,
    password: form.password,
    options: {
      emailRedirectTo: confirmLink("/onboarding"),
      data: { username: form.username, display_name: form.displayName, age_confirmed: true, ...(invitedBy ? { invited_by: invitedBy } : {}) },
    },
  });
  if (error?.code === "user_already_exists") return fail("An account with that email already exists. Sign in instead.");
  if (error?.status === 429) return fail("We're sending a lot of sign-up emails right now. Wait a few minutes and try again.");
  // public.handle_new_user stops the sign-up when someone took the name a moment ago.
  if (error && (await supabase.from("profiles").select("id").eq("username", form.username).maybeSingle()).data) return fail("Someone just took that username. Choose another.");
  if (error) return fail(error.status ? error.message : "Couldn't reach Mavuno. Check your connection and try again.");
  joining.forget();
  return ok({ confirmed: data.session !== null });
}

// Two free names close to the one wanted, as Bluesky offers, so nobody has to guess.
export async function suggestUsernames(base: string): Promise<string[]> {
  const stem = base.replace(/[^a-z0-9_]/g, "").slice(0, 24) || "member";
  const candidates = [`${stem}_au`, `${stem}${Math.floor(Math.random() * 90 + 10)}`, `${stem}_${new Date().getFullYear() % 100}`, `the_${stem}`].filter((name) => usernameSchema.safeParse(name).success);
  const { data } = await supabase.from("profiles").select("username").in("username", candidates);
  const taken = new Set(z.array(z.object({ username: z.string() })).catch([]).parse(data ?? []).map((row) => row.username));
  const free = candidates.filter((name) => !taken.has(name));
  const allowed = await Promise.all(free.map(async (name) => ((await supabase.rpc("is_reserved_username", { p_username: name })).data === true ? null : name)));
  return allowed.filter((name): name is string => name !== null).slice(0, 2);
}

export async function sendMagicLink(email: string): Promise<Result> {
  const parsed = emailSchema.safeParse(email);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const { error } = await supabase.auth.signInWithOtp({ email: parsed.data, options: { emailRedirectTo: confirmLink("/"), shouldCreateUser: false } });
  if (error?.status === 429) return fail("Too many emails. Wait a minute and try again.");
  const problem = notSent(error);
  if (problem) return fail(problem);
  // Whether or not the address has an account, the answer is the same.
  return done;
}

// The same answer whatever the address is about who has an account. A request
// that never left the phone (no status) or that Auth failed (5xx) sent nothing,
// and saying a link is on its way would leave someone waiting for it.
function notSent(error: { status?: number } | null) {
  if (!error) return null;
  if (!error.status) return "Couldn't reach Mavuno. Check your connection and try again.";
  if (error.status >= 500) return "Mavuno couldn't send the email just now. Try again in a moment.";
  return null;
}

export type LinkAnswer = { kind: "verified" } | { kind: "spent" } | { kind: "unreachable"; reason: Reason };

// An email link opened in the app, as the website's /auth/confirm does it.
// A link works once, and signing in remounts the screen that opened it, so a
// link being checked or verified is kept for the rest of the launch. A
// failure isn't: a link tapped with no signal still works once back online.
const verifying = new Map<string, Promise<LinkAnswer>>();

export const emailLinkInHand = (tokenHash: string) => verifying.has(tokenHash);

export function verifyEmailLink(tokenHash: string, type: "signup" | "magiclink" | "email" | "invite"): Promise<LinkAnswer> {
  const known = verifying.get(tokenHash);
  if (known) return known;
  const answer = supabase.auth
    .verifyOtp({ token_hash: tokenHash, type })
    .then(({ error }): LinkAnswer => {
      if (!error) return { kind: "verified" };
      if (!error.status) return { kind: "unreachable", reason: "offline" };
      return error.status >= 500 ? { kind: "unreachable", reason: "server" } : { kind: "spent" };
    })
    .catch((): LinkAnswer => ({ kind: "unreachable", reason: "offline" }));
  verifying.set(tokenHash, answer);
  void answer.then((result) => {
    if (result.kind !== "verified") verifying.delete(tokenHash);
  });
  return answer;
}

// Always the same answer, so nobody can check who is on Mavuno.
export async function requestPasswordReset(email: string): Promise<Result> {
  const parsed = emailSchema.safeParse(email);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data, { redirectTo: confirmLink("/reset-password") });
  if (error?.status === 429) return fail("Too many emails. Wait a minute and try again.");
  const problem = notSent(error);
  if (problem) return fail(problem);
  return done;
}

// Who sent an invite link, shown on the join screens, as /join/<username> does.
export async function loadInviter(username: string): Promise<ProfileCard | null> {
  const parsed = usernameSchema.safeParse(username);
  if (!parsed.success) return null;
  const { data } = await supabase.from("profiles").select("id, username, display_name, avatar_url, colour:effective_colour, account_type, org_verified").eq("username", parsed.data).maybeSingle();
  return profileCardSchema.safeParse(data).data ?? null;
}

// Onboarding: the website's finishOnboarding and joinSpaces.
export async function finishOnboarding(viewerId: string): Promise<Result> {
  const { error } = await supabase.from("profile_settings").update({ onboarded_at: new Date().toISOString() }).eq("id", viewerId);
  return error ? fail(error.message) : done;
}

export async function joinSpaces(viewerId: string, spaceIds: string[]): Promise<Result> {
  if (spaceIds.length === 0) return done;
  const { error } = await supabase.from("space_members").upsert(
    spaceIds.map((spaceId) => ({ space_id: spaceId, user_id: viewerId })),
    { onConflict: "space_id,user_id", ignoreDuplicates: true },
  );
  return error ? fail(error.message) : done;
}
