import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { checkContent } from "@/lib/automod";
import { publicEnv } from "@/lib/env";
import { fetchLinkPreview } from "@/lib/link-preview";
import { createServiceClient } from "@/lib/supabase/server";

// Rows the database hands out from claim_background_tasks. The database
// queues them; this only runs them.
const taskSchema = z.discriminatedUnion("kind", [
  z.object({ id: z.number().int(), kind: z.literal("link_preview"), target_type: z.literal("post"), target_id: z.uuid() }),
  z.object({ id: z.number().int(), kind: z.literal("automatic_check"), target_type: z.enum(["post", "event", "opportunity"]), target_id: z.uuid() }),
]);
type Task = z.infer<typeof taskSchema>;

type Outcome = { kind: "done" } | { kind: "retry"; reason: string } | { kind: "failed"; reason: string };
const done: Outcome = { kind: "done" };

const SITE_HOST = new URL(publicEnv.siteUrl).hostname.replace(/^www\./, "");

// A card of one of our own posts or profiles would copy its text into another
// post, where it would outlive the post or account it came from.
const isOwnPage = (href: string) => URL.parse(href)?.hostname.replace(/^www\./, "") === SITE_HOST;

async function linkPreview(service: SupabaseClient, postId: string): Promise<Outcome> {
  const { data, error } = await service.from("posts").select("link_url").eq("id", postId).maybeSingle();
  if (error) return { kind: "retry", reason: error.message };
  const url = z.object({ link_url: z.string().nullable() }).nullable().parse(data)?.link_url;
  if (!url || isOwnPage(url)) return done;

  const fetched = await fetchLinkPreview(url);
  switch (fetched.kind) {
    case "none":
      return done;
    case "retry":
      return fetched;
    case "found": {
      const { preview } = fetched;
      if (isOwnPage(preview.url)) return done;
      const saved = await service.rpc("set_link_preview", {
        p_post_id: postId,
        p_url: url,
        p_preview: { url: preview.url, title: preview.title, description: preview.description, image: preview.image, site_name: preview.siteName },
      });
      return saved.error ? { kind: "retry", reason: saved.error.message } : done;
    }
  }
}

async function perform(service: SupabaseClient, task: Task): Promise<Outcome> {
  switch (task.kind) {
    case "link_preview":
      return linkPreview(service, task.target_id);
    case "automatic_check":
      return checkContent(task.target_type, task.target_id);
  }
}

async function run(service: SupabaseClient, row: unknown) {
  const task = taskSchema.safeParse(row);
  const id = z.object({ id: z.number().int() }).safeParse(row);
  if (!id.success) return;
  const outcome = task.success
    ? await perform(service, task.data).catch((error: unknown): Outcome => ({ kind: "retry", reason: error instanceof Error ? error.message : "Failed" }))
    : { kind: "failed" as const, reason: "Unknown task" };
  await service.rpc("finish_background_task", {
    p_id: id.data.id,
    p_error: outcome.kind === "done" ? null : outcome.reason,
    p_retry: outcome.kind === "retry",
  });
}

// Claims up to `limit` due tasks (only one post's or listing's when targetId
// is given), runs them side by side and returns how many it ran.
export async function runBackgroundTasks({ targetId = null, limit }: { targetId?: string | null; limit: number }): Promise<number> {
  const service = createServiceClient();
  if (!service) return 0;
  const { data, error } = await service.rpc("claim_background_tasks", { p_limit: limit, p_target_id: targetId });
  if (error) return 0;
  const rows = z.array(z.unknown()).catch([]).parse(data);
  await Promise.all(rows.map((row) => run(service, row)));
  return rows.length;
}

// After something is created: its own tasks first, so its card and check
// don't wait for the daily drain, then a few retries that have come due.
export async function runTasksFor(targetId: string) {
  await runBackgroundTasks({ targetId, limit: 5 });
  await runBackgroundTasks({ limit: 5 });
}

// Vercel's cron runs /api/tasks only once a day on this plan, so busy
// requests also pick up retries, at most once a minute per server instance.
let lastSweep = 0;
export async function sweepDueTasks() {
  if (Date.now() - lastSweep < 60_000) return;
  lastSweep = Date.now();
  await runBackgroundTasks({ limit: 5 });
}
