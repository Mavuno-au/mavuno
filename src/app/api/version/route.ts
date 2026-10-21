import { NextResponse } from "next/server";
import { buildId } from "@/lib/build";

// Written once at build time and served as a static file, so asking which
// deployment is live costs no function run and no database query.
export const dynamic = "force-static";

export function GET() {
  return NextResponse.json({ build: buildId }, { headers: { "cache-control": "no-store" } });
}
