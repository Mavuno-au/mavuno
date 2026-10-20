import "server-only";
import { cookies } from "next/headers";
import { z } from "zod";
import { isoDateSchema } from "@/lib/age";
import { publicEnv } from "@/lib/env";
import type { Supabase } from "@/lib/supabase/server";

// A date of birth is never stored. It waits in this cookie only between the
// age question on the sign-up page and the account being created, which for
// Google means a round trip through Google's sign-in.
const BIRTH_DATE = "mavuno-birth-date";
// Someone who answered that they are under 16 can't answer again straight
// away on the same browser, as eSafety expects.
const UNDER_16 = "mavuno-under-16";

const options = (maxAge: number) => ({ httpOnly: true, sameSite: "lax" as const, secure: publicEnv.siteUrl.startsWith("https:"), maxAge, path: "/" });

export async function meetsMinimumAge(supabase: Supabase, birthDate: string) {
  const { data, error } = await supabase.rpc("meets_minimum_age", { p_birth_date: birthDate });
  const parsed = z.boolean().safeParse(data);
  return error || !parsed.success ? null : parsed.data;
}

export async function rememberBirthDate(birthDate: string) {
  (await cookies()).set(BIRTH_DATE, birthDate, options(30 * 60));
}

export async function readBirthDate() {
  const parsed = isoDateSchema.safeParse((await cookies()).get(BIRTH_DATE)?.value);
  return parsed.success ? parsed.data : null;
}

export async function forgetBirthDate() {
  const store = await cookies();
  if (store.has(BIRTH_DATE)) store.delete(BIRTH_DATE);
}

export async function rememberUnder16() {
  const store = await cookies();
  store.delete(BIRTH_DATE);
  store.set(UNDER_16, "1", options(24 * 60 * 60));
}

export async function answeredUnder16() {
  return (await cookies()).has(UNDER_16);
}
