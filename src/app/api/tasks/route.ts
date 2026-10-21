import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { runBackgroundTasks } from "@/lib/background-tasks";
import { serverEnv } from "@/lib/server-env";
import { createServiceClient } from "@/lib/supabase/server";

export const maxDuration = 60;

const BATCH = 10;
// Leaves room for the last batch's link fetches and moderation requests.
const BUDGET_MS = 30_000;

function authorised(header: string | null, secret: string) {
  const expected = Buffer.from(`Bearer ${secret}`);
  const given = Buffer.from(header ?? "");
  return given.length === expected.length && timingSafeEqual(given, expected);
}

// Run by Vercel's cron (vercel.json): fetches link cards and runs automatic
// checks the request that created them didn't finish, and retries failures.
export async function GET(request: NextRequest) {
  const secret = serverEnv.CRON_SECRET;
  if (!secret || !createServiceClient()) return NextResponse.json({ error: "Background tasks are not configured" }, { status: 503 });
  if (!authorised(request.headers.get("authorization"), secret)) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const until = Date.now() + BUDGET_MS;
  let ran = 0;
  for (;;) {
    const batch = await runBackgroundTasks({ limit: BATCH });
    ran += batch;
    if (batch < BATCH || Date.now() > until) break;
  }
  return NextResponse.json({ ran });
}
