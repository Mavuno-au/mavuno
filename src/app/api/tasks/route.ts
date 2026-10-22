import { timingSafeEqual } from "node:crypto";
import { after, NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { runBackgroundTasks } from "@/lib/background-tasks";
import { allow } from "@/lib/rate-limit";
import { serverEnv } from "@/lib/server-env";
import { createServiceClient, type Supabase } from "@/lib/supabase/server";
import { getRequestViewer } from "@/lib/viewer";

export const maxDuration = 60;

const BATCH = 10;
// Leaves room for the last batch's link fetches and moderation requests.
const BUDGET_MS = 30_000;

function authorised(header: string | null, secret: string) {
  const expected = Buffer.from(`Bearer ${secret}`);
  const given = Buffer.from(header ?? "");
  return given.length === expected.length && timingSafeEqual(given, expected);
}

// Run by Vercel's daily cron (CRON_SECRET) and by the database whenever tasks
// are due (TASKS_SECRET, see wake_background_tasks): fetches link cards and
// runs automatic checks the request that created them didn't finish, and
// retries failures.
export async function GET(request: NextRequest) {
  const secrets = [serverEnv.CRON_SECRET, serverEnv.TASKS_SECRET].filter((secret) => secret !== undefined);
  if (secrets.length === 0 || !createServiceClient()) return NextResponse.json({ error: "Background tasks are not configured" }, { status: 503 });
  const header = request.headers.get("authorization");
  if (!secrets.some((secret) => authorised(header, secret))) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const until = Date.now() + BUDGET_MS;
  let ran = 0;
  for (;;) {
    const batch = await runBackgroundTasks({ limit: BATCH });
    ran += batch;
    if (batch < BATCH || Date.now() > until) break;
  }
  return NextResponse.json({ ran });
}

// The mobile app writes posts, messages and listings straight to the
// database, then asks for their link card and automatic check here, as the
// website's server actions do after they create one; without this they wait
// for the database's next wake-up, up to two minutes. Only for something the
// member wrote, and only its own tasks: each run costs function time, so a
// member can't keep the server busy with other people's ids or retries.
const runSchema = z.object({ targetId: z.uuid() });

async function wroteIt(supabase: Supabase, viewerId: string, targetId: string) {
  const found = await Promise.all([
    supabase.from("posts").select("id").eq("id", targetId).eq("created_by", viewerId).maybeSingle(),
    supabase.from("messages").select("id").eq("id", targetId).eq("sender_id", viewerId).maybeSingle(),
    supabase.from("events").select("id").eq("id", targetId).eq("created_by", viewerId).maybeSingle(),
    supabase.from("opportunities").select("id").eq("id", targetId).eq("created_by", viewerId).maybeSingle(),
  ]);
  return found.some(({ data }) => data !== null);
}

export async function POST(request: NextRequest) {
  const { supabase, viewer } = await getRequestViewer(request);
  if (!viewer) return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  const parsed = runSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Bad request" }, { status: 400 });
  if (!allow(`tasks:${viewer.id}`, 30, 60_000)) return NextResponse.json({ error: "Slow down" }, { status: 429 });
  const { targetId } = parsed.data;
  if (!(await wroteIt(supabase, viewer.id, targetId))) return NextResponse.json({ error: "Not found" }, { status: 404 });
  after(() => runBackgroundTasks({ targetId, limit: 5 }));
  return new NextResponse(null, { status: 202 });
}
