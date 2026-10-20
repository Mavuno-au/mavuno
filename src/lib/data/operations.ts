import "server-only";
import { z } from "zod";
import { type Range, rangeSchema } from "@/lib/metrics";
import { createClient } from "@/lib/supabase/server";

// Shapes of admin_metrics(), admin_activity() and admin_health(); see
// supabase/migrations/*_operations_insights.sql and PRODUCT_METRICS.md.

const count = z.number().int().nonnegative();
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const median = z.number().nonnegative().nullable();

const ratesSchema = z.object({
  signups: count,
  activation: z.object({ eligible: count, activated: count }),
  firstDay: z.object({ eligible: count, onboarded: count, posted: count, followed: count, followedBack: count, medianFollows: median }),
  answered: z.object({ posts: count, answered: count, medianMinutes: median, firstPosts: count, firstAnswered: count }),
  retention: z.array(z.object({ day: count, eligible: count, returned: count })),
});

const metricsSchema = z.object({
  today: day,
  days: rangeSchema,
  signups: z.object({ total: count, today: count, range: count, previousRange: count }),
  active: z.object({ day: count, week: count, month: count, postedMonth: count }),
  current: ratesSchema.extend({
    activationByDay: z.array(z.object({ day, eligible: count, activated: count, complete: z.boolean() })),
  }),
  previous: ratesSchema,
  daily: z.array(z.object({ day, active: count, signups: count, posts: count })),
});

const comparison = z.object({ today: count, yesterday: count });

const activitySchema = z.object({
  today: day,
  days: rangeSchema,
  compare: z.object({ posts: comparison, replies: comparison, signups: comparison, messages: comparison, reports: comparison }),
  statuses: z.array(z.object({ status: z.enum(["published", "pending", "rejected", "deleted"]), count })),
  authors: z.array(z.object({ username: z.string(), displayName: z.string(), posts: count })),
});

const cronJobSchema = z.object({
  name: z.string().nullable(),
  schedule: z.string(),
  active: z.boolean(),
  lastRun: z.string().nullable(),
  lastStatus: z.string().nullable(),
  failedLastDay: count,
  lastError: z.string().nullable(),
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
  overdueScheduled: count,
  oldestOverdueScheduled: z.string().nullable(),
  ageDeactivated: count,
  agePurgeOverdue: count,
  nextAgePurge: z.string().nullable(),
  // Null where pg_cron can't be read.
  cron: z.array(cronJobSchema).nullable(),
  lastDay: z.object({ signups: count, posts: count, messages: count, reports: count }),
});

export type Metrics = z.infer<typeof metricsSchema>;
export type Rates = z.infer<typeof ratesSchema>;
export type Activity = z.infer<typeof activitySchema>;
export type Health = z.infer<typeof healthSchema>;
export type CronJob = z.infer<typeof cronJobSchema>;

export async function loadMetrics(range: Range): Promise<Metrics> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_metrics", { p_days: range });
  if (error) throw new Error(`Metrics failed: ${error.message}`);
  return metricsSchema.parse(data);
}

export async function loadActivity(range: Range): Promise<Activity> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_activity", { p_days: range });
  if (error) throw new Error(`Activity failed: ${error.message}`);
  return activitySchema.parse(data);
}

export async function loadHealth(): Promise<Health> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_health");
  if (error) throw new Error(`Health check failed: ${error.message}`);
  return healthSchema.parse(data);
}
