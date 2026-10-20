import "server-only";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

// Shapes of admin_metrics() and admin_health(); see
// supabase/migrations/*_product_metrics.sql and PRODUCT_METRICS.md.

const count = z.number().int().nonnegative();
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const metricsSchema = z.object({
  today: day,
  signups: z.object({ total: count, today: count, last7: count, previous7: count, last30: count }),
  active: z.object({ day: count, week: count, month: count, postedMonth: count }),
  activation: z.object({ cohort: count, onboarded: count, posted: count, followed: count, followedBack: count }),
  retention: z.array(z.object({ day: count, eligible: count, returned: count })),
  answered: z.object({ posts: count, answered: count }),
  daily: z.array(z.object({ day, active: count, signups: count, posts: count })),
});

const healthSchema = z.object({
  checkedAt: z.string(),
  openReports: count,
  oldestOpenReport: z.string().nullable(),
  awaitingReview: count,
  oldestAwaitingReview: z.string().nullable(),
  suspended: count,
  purgeBacklog: count,
  storageBacklog: count,
  lastDay: z.object({ signups: count, posts: count, messages: count, reports: count }),
});

export type Metrics = z.infer<typeof metricsSchema>;
export type Health = z.infer<typeof healthSchema>;

export async function loadMetrics(): Promise<Metrics> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_metrics");
  if (error) throw new Error(`Metrics failed: ${error.message}`);
  return metricsSchema.parse(data);
}

export async function loadHealth(): Promise<Health> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_health");
  if (error) throw new Error(`Health check failed: ${error.message}`);
  return healthSchema.parse(data);
}
