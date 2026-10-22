"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { done, failFrom, ok, type Result } from "@/lib/result";
import { createClient } from "@/lib/supabase/server";

const switchesSchema = z.object({ automaticCheck: z.boolean(), linkPreviews: z.boolean(), uploads: z.boolean() });

export async function updateSwitches(input: z.input<typeof switchesSchema>): Promise<Result> {
  const switches = switchesSchema.parse(input);
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_update_switches", {
    p_automatic_check: switches.automaticCheck,
    p_link_previews: switches.linkPreviews,
    p_uploads: switches.uploads,
  });
  if (error) return failFrom(error);
  refresh();
  return done;
}

// Tasks that gave up: try them all again, or dismiss them (Health tab).
export async function settleFailedTasks(retry: boolean): Promise<Result<number>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_settle_failed_tasks", { p_retry: z.boolean().parse(retry) });
  if (error) return failFrom(error);
  refresh();
  return ok(z.number().int().nonnegative().parse(data));
}
