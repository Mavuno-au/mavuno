import "server-only";
import { z } from "zod";
import { SCHEDULED_LIMIT, SCHEDULED_SELECT, scheduledRow, type ScheduledPost } from "@/lib/scheduled-posts";
import { createClient } from "@/lib/supabase/server";

export * from "@/lib/scheduled-posts";

export async function loadScheduledPosts(): Promise<ScheduledPost[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("scheduled_posts")
    .select(SCHEDULED_SELECT)
    .order("submitted_at", { ascending: false, nullsFirst: true })
    .order("scheduled_at")
    .limit(SCHEDULED_LIMIT);
  if (error) throw error;
  return z.array(scheduledRow).parse(data);
}
