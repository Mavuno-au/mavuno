import { NextResponse } from "next/server";
import { createGuestClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// For an uptime monitor: one guest query against a one-row table says whether
// the app and its database answer. Nothing here needs a secret or reveals one.
export async function GET() {
  const { error } = await createGuestClient().from("site_settings").select("id").limit(1).abortSignal(AbortSignal.timeout(3000));
  const ok = error === null;
  return NextResponse.json({ ok, database: ok }, { status: ok ? 200 : 503, headers: { "cache-control": "no-store" } });
}
