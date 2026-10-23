import type { Instrumentation } from "next";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { publicEnv } from "@/lib/env";
import { errorDigest, errorMessage, errorSummary } from "@/lib/error-text";
import { serverEnv } from "@/lib/server-env";

const kindSchema = z.enum(["render", "route", "action", "proxy"]);

// Vercel keeps function logs for a short while, so server errors are counted
// in the database instead, by route pattern and digest: enough to see what
// is failing on the Health tab, and nothing about who was asking. Only
// production records; a developer's errors stay in the terminal.
type Context = Parameters<Instrumentation.onRequestError>[2];

export async function recordServerError(error: unknown, context: Context) {
  if (process.env.NODE_ENV !== "production" || !serverEnv.SUPABASE_SERVICE_ROLE_KEY) return;
  const message = errorMessage(error);
  const service = createClient(publicEnv.supabaseUrl, serverEnv.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  // A failure to record must never become another error to record.
  await service
    .rpc("record_server_error", {
      p_digest: errorDigest(error) ?? "none",
      p_route: context.routePath,
      p_kind: kindSchema.catch("render").parse(context.routeType),
      p_message: errorSummary(message),
    })
    .then(
      () => undefined,
      () => undefined,
    );
}
