"use server";

import { z } from "zod";
import { DISPLAY_TIME_ZONE } from "@/lib/format";
import { findFilter, isFilterKey, notificationGroupSchema, notificationSchema, type Notification, type NotificationGroup } from "@/lib/notifications";
import { failFrom, done, fail, ok, type Result } from "@/lib/result";
import { createClient } from "@/lib/supabase/server";

const PAGE_SIZE = 20;

const at = z.iso.datetime({ offset: true });

// Follows are grouped by the reader's day, so their zone travels with the
// request. One the database wouldn't know falls back to the site's.
const timeZoneSchema = z
  .string()
  .max(64)
  .optional()
  .transform((zone) => {
    if (!zone) return DISPLAY_TIME_ZONE;
    try {
      new Intl.DateTimeFormat("en-AU", { timeZone: zone });
      return zone;
    } catch {
      return DISPLAY_TIME_ZONE;
    }
  });

const requestSchema = z.object({
  recipientId: z.uuid(),
  filter: z.custom(isFilterKey),
  timeZone: timeZoneSchema,
  cursor: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("first") }),
    z.object({ kind: z.literal("before"), at, key: z.string().max(80) }),
    z.object({ kind: z.literal("after"), at }),
  ]),
});

export type NotificationRequest = z.input<typeof requestSchema>;

export type NotificationCursor = { at: string; key: string };

// `next` is the cursor for the page after this one, or null when nothing older
// is left. `timeZone` is the one the groups were cut by.
export type NotificationPage = { groups: NotificationGroup[]; next: NotificationCursor | null; timeZone: string };

export async function loadNotifications(input: NotificationRequest): Promise<Result<NotificationPage>> {
  const parsed = requestSchema.safeParse(input);
  if (!parsed.success) return fail("Something went wrong. Try again.");
  const { recipientId, filter, timeZone, cursor } = parsed.data;
  const { types } = findFilter(filter);

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("notification_groups", {
    p_recipient_id: recipientId,
    p_types: types ? [...types] : null,
    p_time_zone: timeZone,
    p_before_at: cursor.kind === "before" ? cursor.at : null,
    p_before_key: cursor.kind === "before" ? cursor.key : null,
    p_after_at: cursor.kind === "after" ? cursor.at : null,
    p_limit: PAGE_SIZE,
  });
  if (error) return failFrom(error);
  const groups = z.array(notificationGroupSchema).parse(data ?? []);
  const last = groups.at(-1);
  return ok({ groups, next: groups.length === PAGE_SIZE && last ? { at: last.latestAt, key: last.key } : null, timeZone });
}

const itemsSchema = z.object({ recipientId: z.uuid(), key: z.string().max(80), timeZone: timeZoneSchema });

// Everyone and everything in one group, for "See all".
export async function loadNotificationGroup(input: z.input<typeof itemsSchema>): Promise<Result<Notification[]>> {
  const parsed = itemsSchema.safeParse(input);
  if (!parsed.success) return fail("Something went wrong. Try again.");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("notification_group_items", {
    p_recipient_id: parsed.data.recipientId,
    p_key: parsed.data.key,
    p_time_zone: parsed.data.timeZone,
  });
  if (error) return failFrom(error);
  return ok(z.array(notificationSchema).parse(data ?? []));
}

// Only what the open tab shows is marked read.
export async function markNotificationsRead(recipientId: string, filter: string): Promise<Result> {
  const { types } = findFilter(filter);
  const supabase = await createClient();
  const { error } = await supabase.rpc("mark_notifications_read", { p_recipient_id: z.uuid().parse(recipientId), p_types: types ? [...types] : null });
  return error ? failFrom(error) : done;
}
