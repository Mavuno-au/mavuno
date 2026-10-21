import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { serverEnv } from "@/lib/server-env";
import { createServiceClient } from "@/lib/supabase/server";

const BATCH = 1000;
// A daily run has to clear a day's queue; stop well inside the time limit.
const MAX_BATCHES = 20;
export const maxDuration = 60;

const cleanupRows = z.array(z.object({ bucket: z.string(), path: z.string() }));

function authorised(header: string | null, secret: string) {
  const given = Buffer.from(header ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

type Service = NonNullable<ReturnType<typeof createServiceClient>>;

// Storage files can only be removed through the Storage API, so pg_cron can't
// do this part: the database queues paths in storage_cleanup and this empties it.
async function removeQueuedFiles(service: Service) {
  let removedFiles = 0;
  for (let batch = 0; batch < MAX_BATCHES; batch++) {
    const { data, error } = await service.from("storage_cleanup").select("bucket, path").order("created_at").limit(BATCH);
    if (error) throw new Error(error.message);
    const rows = cleanupRows.parse(data ?? []);
    const byBucket = new Map<string, string[]>();
    for (const row of rows) byBucket.set(row.bucket, [...(byBucket.get(row.bucket) ?? []), row.path]);
    let progressed = false;
    for (const [bucket, paths] of byBucket) {
      const removed = await service.storage.from(bucket).remove(paths);
      if (removed.error) continue;
      await service.from("storage_cleanup").delete().eq("bucket", bucket).in("path", paths);
      removedFiles += paths.length;
      progressed = true;
    }
    if (rows.length < BATCH || !progressed) break;
  }
  return removedFiles;
}

// Publishes due scheduled posts, erases deleted posts past their undo window,
// deletes accounts deactivated for being under 16 that no review reinstated, and
// removes files left behind by erased content. pg_cron runs the database parts
// every minute where it's installed; running them here as well is harmless.
async function maintain() {
  const service = createServiceClient();
  if (!service) return NextResponse.json({ error: "Maintenance is not configured" }, { status: 503 });

  const scheduled = await service.rpc("publish_scheduled_posts");
  if (scheduled.error) return NextResponse.json({ error: scheduled.error.message }, { status: 500 });

  const purge = await service.rpc("purge_deleted_posts");
  if (purge.error) return NextResponse.json({ error: purge.error.message }, { status: 500 });

  const deactivated = await service.rpc("purge_deactivated_accounts");
  if (deactivated.error) return NextResponse.json({ error: deactivated.error.message }, { status: 500 });

  let removedFiles: number;
  try {
    removedFiles = await removeQueuedFiles(service);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Storage cleanup failed" }, { status: 500 });
  }

  return NextResponse.json({ scheduledPosts: z.number().catch(0).parse(scheduled.data), purgedPosts: z.number().catch(0).parse(purge.data), deletedAccounts: z.number().catch(0).parse(deactivated.data), removedFiles });
}

// Vercel's cron (vercel.json) sends a GET with CRON_SECRET.
export async function GET(request: Request) {
  if (!serverEnv.CRON_SECRET) return NextResponse.json({ error: "Maintenance is not configured" }, { status: 503 });
  if (!authorised(request.headers.get("authorization"), serverEnv.CRON_SECRET)) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  return maintain();
}

// For any other scheduler, with MAINTENANCE_SECRET.
export async function POST(request: Request) {
  if (!serverEnv.MAINTENANCE_SECRET) return NextResponse.json({ error: "Maintenance is not configured" }, { status: 503 });
  if (!authorised(request.headers.get("authorization"), serverEnv.MAINTENANCE_SECRET)) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  return maintain();
}
