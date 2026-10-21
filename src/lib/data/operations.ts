import "server-only";
import { z } from "zod";
import { type Range, rangeSchema } from "@/lib/metrics";
import { createClient } from "@/lib/supabase/server";

// Shapes of admin_metrics(), admin_activity() and admin_health(); see
// supabase/migrations/*_operations_insights.sql, *_server_errors_and_switches.sql
// and PRODUCT_METRICS.md.

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

const failedTaskSchema = z.object({
  kind: z.enum(["link_preview", "automatic_check"]),
  targetType: z.enum(["post", "event", "opportunity", "message"]),
  attempts: count,
  error: z.string().nullable(),
  failedAt: z.string(),
});

const serverErrorSchema = z.object({
  digest: z.string(),
  route: z.string(),
  kind: z.enum(["render", "route", "action", "proxy"]),
  message: z.string(),
  count: count,
  firstSeen: z.string(),
  lastSeen: z.string(),
});

const switchesSchema = z.object({ automaticCheck: z.boolean(), linkPreviews: z.boolean(), uploads: z.boolean() });

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
  tasks: z.object({ failed: count, held: count, overdue: count, failures: z.array(failedTaskSchema) }),
  errors: z.object({ lastDay: count, recent: z.array(serverErrorSchema) }),
  switches: switchesSchema.extend({ premoderation: z.boolean(), translations: z.boolean() }),
  lastDay: z.object({ signups: count, posts: count, messages: count, reports: count }),
});

export type Metrics = z.infer<typeof metricsSchema>;
export type Rates = z.infer<typeof ratesSchema>;
export type Activity = z.infer<typeof activitySchema>;
export type Health = z.infer<typeof healthSchema>;
export type CronJob = z.infer<typeof cronJobSchema>;
export type FailedTask = z.infer<typeof failedTaskSchema>;
export type ServerError = z.infer<typeof serverErrorSchema>;
export type Switches = z.infer<typeof switchesSchema>;

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

const switchesRow = z.object({ automatic_check: z.boolean(), link_previews: z.boolean(), uploads: z.boolean() });

// The three things an admin can pause without a deploy (Moderation → Admin).
export async function loadSwitches(): Promise<Switches> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("site_settings").select("automatic_check, link_previews, uploads").single();
  if (error) throw new Error(`Switches failed: ${error.message}`);
  const row = switchesRow.parse(data);
  return { automaticCheck: row.automatic_check, linkPreviews: row.link_previews, uploads: row.uploads };
}
