import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { safeNext } from "@/lib/safe-redirect";
import { createClient } from "@/lib/supabase/server";
import { arrivalPath } from "@/lib/viewer";

const OTP_TYPES: readonly EmailOtpType[] = ["signup", "invite", "magiclink", "recovery", "email_change", "email"];
const isOtpType = (value: string | null): value is EmailOtpType => OTP_TYPES.some((type) => type === value);

// Email links (confirm sign-up, reset password) land here with a token hash.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type");

  if (tokenHash && isOtpType(type)) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    if (!error) {
      const next = type === "recovery" ? "/reset-password" : await arrivalPath(supabase, safeNext(searchParams.get("next")));
      return NextResponse.redirect(new URL(next, origin));
    }
  }
  return NextResponse.redirect(new URL("/login?error=link", origin));
}
