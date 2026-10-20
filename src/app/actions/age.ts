"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { birthDateSchema } from "@/lib/age";
import { answeredUnder16, meetsMinimumAge, rememberBirthDate, rememberUnder16 } from "@/lib/age-check";
import { fail, failFrom, ok, type Result } from "@/lib/result";
import { safeNext } from "@/lib/safe-redirect";
import { firstIssue } from "@/lib/schemas";
import { createClient } from "@/lib/supabase/server";

export type AgeAnswer = { kind: "old_enough" } | { kind: "under_16" };

// Before there is an account: the sign-up page asks first, for both email
// and Google.
export async function checkAge(_: Result<AgeAnswer> | null, form: FormData): Promise<Result<AgeAnswer>> {
  if (await answeredUnder16()) return ok({ kind: "under_16" });
  const parsed = birthDateSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return fail(firstIssue(parsed.error));

  const old = await meetsMinimumAge(await createClient(), parsed.data);
  if (old === null) return fail("We couldn't check that. Try again.");
  if (!old) {
    await rememberUnder16();
    return ok({ kind: "under_16" });
  }
  await rememberBirthDate(parsed.data);
  return ok({ kind: "old_enough" });
}

// Members who joined before the check, or through Google from the sign-in
// page, answer once in the app.
export async function confirmAge(_: Result | null, form: FormData): Promise<Result> {
  const parsed = birthDateSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return fail(firstIssue(parsed.error));

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("confirm_age", { p_birth_date: parsed.data });
  if (error) return failFrom(error);
  if (z.boolean().parse(data)) redirect(safeNext(form.get("next")));
  await rememberUnder16();
  redirect("/deactivated");
}
