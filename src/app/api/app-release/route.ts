import { NextResponse } from "next/server";
import { APP_RELEASE } from "@/lib/app-release";

// Written once at build time and served as a static file, so every app launch
// costs no function run and no database query.
export const dynamic = "force-static";

export function GET() {
  return NextResponse.json(APP_RELEASE, { headers: { "cache-control": "no-store" } });
}
