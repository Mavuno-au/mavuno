import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { serverEnv } from "@/lib/server-env";
import { createServiceClient } from "@/lib/supabase/server";

const BATCH = 1000;
const cleanupRows = z.array(z.object({ bucket: z.string(), path: z.string() }));

function authorised(header: string | null, secret: string) {
  const given = Buffer.from(header ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

// Publishes due scheduled posts, erases deleted posts past their undo window,
// deletes accounts deactivated for being under 16 that no review reinstated, and
// removes files left behind by erased content. Meant for a scheduler where
// pg_cron is not available.
export async function POST(request: Request) {
  const service = createServiceClient();
  if (!serverEnv.MAINTENANCE_SECRET || !service) return NextResponse.json({ error: "Maintenance is not configured" }, { status: 503 });
  if (!authorised(request.headers.get("authorization"), serverEnv.MAINTENANCE_SECRET)) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const scheduled = await service.rpc("publish_scheduled_posts");
  if (scheduled.error) return NextResponse.json({ error: scheduled.error.message }, { status: 500 });

  const purge = await service.rpc("purge_deleted_posts");
  if (purge.error) return NextResponse.json({ error: purge.error.message }, { status: 500 });

  const deactivated = await service.rpc("purge_deactivated_accounts");
  if (deactivated.error) return NextResponse.json({ error: deactivated.error.message }, { status: 500 });

  const { data, error } = await service.from("storage_cleanup").select("bucket, path").order("created_at").limit(BATCH);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const byBucket = new Map<string, string[]>();
  for (const row of cleanupRows.parse(data ?? [])) byBucket.set(row.bucket, [...(byBucket.get(row.bucket) ?? []), row.path]);
  let removedFiles = 0;
  for (const [bucket, paths] of byBucket) {
    const removed = await service.storage.from(bucket).remove(paths);
    if (removed.error) continue;
    await service.from("storage_cleanup").delete().eq("bucket", bucket).in("path", paths);
    removedFiles += paths.length;
  }

  return NextResponse.json({ scheduledPosts: z.number().catch(0).parse(scheduled.data), purgedPosts: z.number().catch(0).parse(purge.data), deletedAccounts: z.number().catch(0).parse(deactivated.data), removedFiles });
}
