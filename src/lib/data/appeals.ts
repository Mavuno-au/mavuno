import "server-only";
import { z } from "zod";
import { notificationSchema } from "@/lib/notifications";
import { createClient } from "@/lib/supabase/server";

// A moderation notice the viewer received, as themselves or for an
// organisation they help run. Row level security hides everyone else's.
export async function loadModerationNotice(id: number) {
  const supabase = await createClient();
  const { data } = await supabase.from("notification_details").select("*").eq("id", id).eq("type", "moderation").maybeSingle();
  const notification = notificationSchema.nullable().parse(data);
  return notification?.notice ? { ...notification, notice: notification.notice } : null;
}

export const noticeIdSchema = z.coerce.number().int().positive();
