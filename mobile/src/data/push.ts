import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
// Named: the lint rule import/namespace can't see enums re-exported with export *.
import { AndroidImportance, IosAuthorizationStatus } from "expo-notifications";
import { router } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { AppState, Platform } from "react-native";
import { z } from "zod";
import { type Result } from "@/lib/result";
import { requestError } from "@/data/errors";
import { updateSettings } from "@/data/profiles";
import { supabase } from "@/data/supabase";
import { createEvent } from "@/util/events";

// Push notifications come from the database through Expo's push service
// (supabase/migrations/20261023040121_push_notifications.sql). The app asks
// for permission, registers this phone's token, keeps the icon's number and
// opens what a tapped notification is about.

// The database's push_kind.
export type PushKind = "reply" | "mention" | "quote" | "like" | "follow" | "joined" | "event_rsvp" | "org_added" | "moderation" | "message" | "message_request";

// The settings screen's switches, in Bluesky's order and words where they fit.
export const PUSH_GROUPS: readonly { title: string; kinds: readonly { kind: PushKind; label: string; hint?: string }[] }[] = [
  {
    title: "Messages",
    kinds: [
      { kind: "message", label: "New messages", hint: "Who wrote, not what they said." },
      { kind: "message_request", label: "New message requests" },
    ],
  },
  {
    title: "Activity",
    kinds: [
      { kind: "reply", label: "Replies" },
      { kind: "mention", label: "Mentions" },
      { kind: "quote", label: "Quotes" },
      { kind: "like", label: "Likes", hint: "At most one an hour for each post." },
      { kind: "follow", label: "New followers", hint: "At most one an hour." },
    ],
  },
  {
    title: "Everything else",
    kinds: [
      { kind: "joined", label: "Friends who join from your invite" },
      { kind: "event_rsvp", label: "Event RSVPs" },
      { kind: "org_added", label: "Team invitations" },
      { kind: "moderation", label: "Moderation updates" },
    ],
  },
];

// The member is in the app already, with its own badges, so a push that
// arrives while it's open only updates the icon.
Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: false, shouldShowList: false, shouldPlaySound: false, shouldSetBadge: true }),
});

// Set once the project is registered with Expo (mobile/README.md). A build
// without it can't get a token, so it never offers notifications.
const projectId = z.uuid().safeParse(Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId).data ?? null;
export const pushAvailable = projectId !== null;

const tokenSchema = z.string().regex(/^Expo(nent)?PushToken\[[A-Za-z0-9_-]{1,200}\]$/);
// This phone's token, kept so signing out can remove it.
const TOKEN_KEY = "mavuno-push-token";
// When the member last chose "Not now".
const DECLINED_KEY = "mavuno-push-declined";
const ASK_AGAIN_AFTER = 30 * 24 * 60 * 60 * 1000;

export type PushPermission = "granted" | "undetermined" | "denied";

const changed = createEvent();

export async function pushPermission(): Promise<PushPermission> {
  const settings = await Notifications.getPermissionsAsync();
  if (settings.granted || settings.ios?.status === IosAuthorizationStatus.PROVISIONAL) return "granted";
  return settings.canAskAgain ? "undetermined" : "denied";
}

async function androidChannel() {
  // Android 13 asks for permission only once a channel exists.
  if (Platform.OS === "android") await Notifications.setNotificationChannelAsync("default", { name: "Mavuno", importance: AndroidImportance.DEFAULT });
}

// On every launch, so the database knows the phone is still in use and a
// token Apple replaced is swapped for the new one.
export async function registerPush(): Promise<boolean> {
  if (!projectId || (await pushPermission()) !== "granted") return false;
  try {
    await androidChannel();
    const token = tokenSchema.parse((await Notifications.getExpoPushTokenAsync({ projectId })).data);
    const { error } = await supabase.rpc("register_push_token", { p_token: token });
    if (error) return false;
    localStorage.setItem(TOKEN_KEY, token);
    return true;
  } catch {
    // Offline, or Expo didn't answer: the next launch tries again.
    return false;
  }
}

// Signed out works too: the token is the proof.
export async function unregisterPush() {
  const token = localStorage.getItem(TOKEN_KEY);
  localStorage.removeItem(TOKEN_KEY);
  void Notifications.setBadgeCountAsync(0).catch(() => false);
  if (token) await supabase.rpc("unregister_push_token", { p_token: token });
}

export async function askForPush(): Promise<PushPermission> {
  await androidChannel();
  await Notifications.requestPermissionsAsync();
  const permission = await pushPermission();
  if (permission === "granted") await registerPush();
  changed.emit();
  return permission;
}

export function declinePush() {
  localStorage.setItem(DECLINED_KEY, String(Date.now()));
  changed.emit();
}

const recentlyDeclined = () => Date.now() - Number(localStorage.getItem(DECLINED_KEY) ?? 0) < ASK_AGAIN_AFTER;

// Whether to show the card that asks: only where notifications would help
// (the Notifications and Messages tabs), never on first launch, and not again
// for a month after "Not now".
export function usePushOffer() {
  const [offer, setOffer] = useState(false);
  useEffect(() => {
    let current = true;
    const check = () =>
      void pushPermission().then((permission) => {
        if (current) setOffer(pushAvailable && permission === "undetermined" && !recentlyDeclined());
      });
    check();
    const stop = changed.on(check);
    return () => {
      current = false;
      stop();
    };
  }, []);
  return offer;
}

// Strings, so a kind added after this build is kept when the member saves.
const pushOffRow = z.object({ push_off: z.array(z.string()) });

export async function loadPushOff(viewerId: string): Promise<string[]> {
  const { data, error } = await supabase.from("profile_settings").select("push_off").eq("id", viewerId).single();
  if (error) throw requestError("Notification settings", error);
  return pushOffRow.parse(data).push_off;
}

export function savePushOff(viewerId: string, off: readonly string[]): Promise<Result> {
  return updateSettings(viewerId, { push_off: off });
}

export function setBadge(count: number) {
  void Notifications.setBadgeCountAsync(Math.max(0, count)).catch(() => false);
}

// Where a tapped notification goes. Paths come from push_message in the
// database; anything else is ignored.
type Destination =
  | { kind: "post"; id: string }
  | { kind: "event"; id: string }
  | { kind: "profile"; username: string }
  | { kind: "conversation"; id: string }
  | { kind: "notifications" }
  | { kind: "organisations" };

const id = z.uuid();
const username = z.string().regex(/^[a-z0-9_]{1,30}$/);

export function destinationOf(path: unknown): Destination | null {
  if (typeof path !== "string") return null;
  if (path === "/notifications") return { kind: "notifications" };
  if (path === "/settings/organisations") return { kind: "organisations" };
  const match = /^\/(post|event|profile|conversation)\/([^/]+)$/.exec(path);
  if (!match) return null;
  const [, kind, value] = match;
  switch (kind) {
    case "post":
    case "event":
    case "conversation": {
      const parsed = id.safeParse(value);
      return parsed.success ? { kind, id: parsed.data } : null;
    }
    case "profile": {
      const parsed = username.safeParse(value);
      return parsed.success ? { kind, username: parsed.data } : null;
    }
    default:
      return null;
  }
}

function open(destination: Destination) {
  switch (destination.kind) {
    case "post":
      return router.push(`/post/${destination.id}`);
    case "event":
      return router.push(`/event/${destination.id}`);
    case "profile":
      return router.push(`/profile/${destination.username}`);
    case "conversation":
      return router.push(`/conversation/${destination.id}`);
    case "notifications":
      return router.navigate("/notifications");
    case "organisations":
      return router.push("/settings/organisations");
  }
}

// For a signed-in member: register this phone, follow permission changes made
// in iOS Settings, and open what a tapped notification is about, including
// the one that launched the app.
export function PushNotifications({ viewerId }: { viewerId: string | null }) {
  const response = Notifications.useLastNotificationResponse();
  const handled = useRef<string | null>(null);

  useEffect(() => {
    if (!viewerId) return;
    void registerPush();
    const tokens = Notifications.addPushTokenListener(() => void registerPush());
    const appState = AppState.addEventListener("change", (state) => {
      if (state !== "active") return;
      void pushPermission().then((permission) => {
        const registered = localStorage.getItem(TOKEN_KEY) !== null;
        if (permission === "granted" && !registered) void registerPush();
        if (permission !== "granted" && registered) void unregisterPush();
        changed.emit();
      });
    });
    return () => {
      tokens.remove();
      appState.remove();
    };
  }, [viewerId]);

  useEffect(() => {
    if (!viewerId || !response || response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return;
    const { identifier, content } = response.notification.request;
    if (handled.current === identifier) return;
    handled.current = identifier;
    Notifications.clearLastNotificationResponse();
    // What a tap was about is read now, so the rest on the lock screen are stale.
    void Notifications.dismissAllNotificationsAsync();
    // A phone that changed hands keeps notifications sent to the last member;
    // theirs would open on a screen this member can't see.
    if (content.data?.recipient !== viewerId) return;
    const destination = destinationOf(content.data?.path);
    if (destination) open(destination);
  }, [viewerId, response]);

  return null;
}
