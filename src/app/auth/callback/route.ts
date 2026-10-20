import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { forgetBirthDate, readBirthDate } from "@/lib/age-check";
import { safeNext } from "@/lib/safe-redirect";
import { createClient } from "@/lib/supabase/server";

// OAuth and magic-link sign-ins come back here with a one-time code. Someone
// who joined with Google answered the age question before leaving, so it is
// recorded now; anyone else is asked in the app.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const next = safeNext(searchParams.get("next"));

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const birthDate = await readBirthDate();
      await forgetBirthDate();
      if (birthDate) {
        const { data } = await supabase.rpc("confirm_age", { p_birth_date: birthDate });
        if (z.boolean().safeParse(data).data === false) return NextResponse.redirect(new URL("/deactivated", origin));
      }
      return NextResponse.redirect(new URL(next, origin));
    }
  }
  return NextResponse.redirect(new URL("/login?error=link", origin));
}
