import { z } from "zod";
import { findFilter, notificationGroupSchema, notificationSchema, type Notification, type NotificationFilterKey, type NotificationGroup } from "@/lib/notifications";
import { done, failFrom, type Result } from "@/lib/result";
import { lenient } from "@/data/community";
import { requestError } from "@/data/errors";
import { supabase } from "@/data/supabase";
import { timeZone } from "@/util/time";

// The website's notification actions (src/app/actions/notifications.ts),
// against the same database functions. Follows are grouped by the reader's
// day, so the phone's time zone goes with each request.
const NOTIFICATION_PAGE = 20;

type NotificationCursor = { kind: "first" } | { kind: "before"; at: string; key: string } | { kind: "after"; at: string };
type NotificationPage = { groups: NotificationGroup[]; next: { at: string; key: string } | null };

export async function loadNotifications(recipientId: string, filter: NotificationFilterKey, cursor: NotificationCursor): Promise<NotificationPage> {
  const { types } = findFilter(filter);
  const { data, error } = await supabase.rpc("notification_groups", {
    p_recipient_id: recipientId,
    p_types: types ? [...types] : null,
    p_time_zone: timeZone,
    p_before_at: cursor.kind === "before" ? cursor.at : null,
    p_before_key: cursor.kind === "before" ? cursor.key : null,
    p_after_at: cursor.kind === "after" ? cursor.at : null,
    p_limit: NOTIFICATION_PAGE,
  });
  if (error) throw requestError("Notifications", error);
  const groups = lenient(notificationGroupSchema, data);
  const last = groups.at(-1);
  return { groups, next: groups.length === NOTIFICATION_PAGE && last ? { at: last.latestAt, key: last.key } : null };
}

// Everyone and everything in one group, for "See all".
export async function loadNotificationGroup(recipientId: string, key: string): Promise<Notification[]> {
  const { data, error } = await supabase.rpc("notification_group_items", { p_recipient_id: recipientId, p_key: key, p_time_zone: timeZone });
  if (error) throw requestError("Notification group", error);
  return z.array(notificationSchema).parse(data ?? []);
}

// Only what the open filter shows is marked read.
export async function markNotificationsRead(recipientId: string, filter: NotificationFilterKey): Promise<Result> {
  const { types } = findFilter(filter);
  const { error } = await supabase.rpc("mark_notifications_read", { p_recipient_id: recipientId, p_types: types ? [...types] : null });
  return error ? failFrom(error) : done;
}

// The notice an appeal is about (src/lib/data/appeals.ts).
export async function loadModerationNotice(id: number) {
  const { data, error } = await supabase.from("notification_details").select("*").eq("id", id).eq("type", "moderation").maybeSingle();
  if (error) throw requestError("Notice", error);
  return data ? (notificationSchema.safeParse(data).data ?? null) : null;
}
