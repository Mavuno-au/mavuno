import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { forgetBirthDate, readBirthDate } from "@/lib/age-check";
import { safeNext } from "@/lib/safe-redirect";
import { usernameSchema } from "@/lib/schemas";
import { createClient } from "@/lib/supabase/server";
import { arrivalPath } from "@/lib/viewer";

// OAuth and magic-link sign-ins come back here with a one-time code. Someone
// who joined with Google answered the age question before leaving, so it is
// recorded now; anyone else is asked in the app. Someone who came from an
// invite link brings the inviter's username, which only counts for an account
// made in the last hour (accept_invite).
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
      const invite = usernameSchema.safeParse(searchParams.get("invite")).data;
      if (invite) await supabase.rpc("accept_invite", { p_username: invite });
      return NextResponse.redirect(new URL(await arrivalPath(supabase, next), origin));
    }
  }
  return NextResponse.redirect(new URL("/login?error=link", origin));
}
