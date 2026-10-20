"use server";

import { z } from "zod";
import { findFilter, isFilterKey, notificationSchema, type Notification } from "@/lib/notifications";
import { failFrom, done, fail, ok, type Result } from "@/lib/result";
import { createClient } from "@/lib/supabase/server";

const PAGE_SIZE = 40;

const at = z.iso.datetime({ offset: true });

const requestSchema = z.object({
  recipientId: z.uuid(),
  filter: z.custom(isFilterKey),
  cursor: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("first") }),
    z.object({ kind: z.literal("before"), at }),
    z.object({ kind: z.literal("after"), at }),
  ]),
});

export type NotificationRequest = z.input<typeof requestSchema>;

// `next` is the cursor for the page after this one, or null when nothing older is left.
export type NotificationPage = { notifications: Notification[]; next: string | null };

export async function loadNotifications(input: NotificationRequest): Promise<Result<NotificationPage>> {
  const parsed = requestSchema.safeParse(input);
  if (!parsed.success) return fail("Something went wrong. Try again.");
  const { recipientId, filter, cursor } = parsed.data;
  const { types } = findFilter(filter);

  const supabase = await createClient();
  let query = supabase.from("notification_details").select("*").eq("recipient_id", recipientId).order("created_at", { ascending: false }).limit(PAGE_SIZE);
  if (types) query = query.in("type", [...types]);
  switch (cursor.kind) {
    case "first":
      break;
    case "before":
      query = query.lt("created_at", cursor.at);
      break;
    case "after":
      query = query.gt("created_at", cursor.at);
      break;
    default: {
      const exhaustive: never = cursor;
      return exhaustive;
    }
  }

  const { data, error } = await query;
  if (error) return failFrom(error);
  const notifications = z.array(notificationSchema).parse(data ?? []);
  return ok({ notifications, next: notifications.length === PAGE_SIZE ? (notifications.at(-1)?.createdAt ?? null) : null });
}

export async function markNotificationsRead(recipientId: string): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("mark_notifications_read", { p_recipient_id: z.uuid().parse(recipientId) });
  return error ? failFrom(error) : done;
}
