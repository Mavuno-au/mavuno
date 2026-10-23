import type { RealtimePostgresInsertPayload } from "@supabase/supabase-js";
import { createContext, use, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { AppState } from "react-native";
import { z } from "zod";
import { setBadge } from "@/data/push";
import { supabase } from "@/data/supabase";

type Counts = { notifications: number; messages: number };
type Store = Counts & { refresh: () => void };

const CountsContext = createContext<Store>({ notifications: 0, messages: 0, refresh: () => {} });

const count = z.number().int().min(0).catch(0);

async function readCounts(): Promise<Counts | null> {
  const [notifications, messages] = await Promise.all([supabase.rpc("unread_notification_count"), supabase.rpc("unread_message_count")]);
  if (notifications.error || messages.error) return null;
  return { notifications: count.parse(notifications.data), messages: count.parse(messages.data) };
}

// The badges on Notifications and Messages, as the website's live-counts.tsx:
// Realtime says when something arrived (row level security filters it), the
// database says how many, and a read every minute covers a dropped socket.
export function CountsProvider({ viewerId, children }: { viewerId: string | null; children: ReactNode }) {
  const [counts, setCounts] = useState<Counts>({ notifications: 0, messages: 0 });

  const refresh = useCallback(() => {
    void readCounts().then((read) => {
      // The same numbers keep the same object, so screens that read the
      // counts don't run again for nothing.
      if (read) setCounts((current) => (current.notifications === read.notifications && current.messages === read.messages ? current : read));
    });
  }, []);

  useEffect(() => {
    if (!viewerId) return;
    refresh();
    const channel = supabase
      .channel(`counts:${viewerId}`, { config: { private: true } })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: `recipient_id=eq.${viewerId}` }, refresh)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, (payload: RealtimePostgresInsertPayload<{ sender_id: string | null }>) => {
        // The database leaves out muted, archived and already-read conversations.
        if (payload.new.sender_id !== viewerId) refresh();
      })
      .subscribe();
    const timer = setInterval(() => {
      if (AppState.currentState === "active") refresh();
    }, 60_000);
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") refresh();
    });
    return () => {
      clearInterval(timer);
      subscription.remove();
      void supabase.removeChannel(channel);
    };
  }, [viewerId, refresh]);

  // The app icon shows the two badges added up, and nothing once signed out.
  const total = viewerId ? counts.notifications + counts.messages : 0;
  useEffect(() => setBadge(total), [total]);

  const store = useMemo(() => ({ ...counts, refresh }), [counts, refresh]);
  return <CountsContext value={store}>{children}</CountsContext>;
}

export const useCounts = () => use(CountsContext);

// A tab badge: a count, never more than 99+.
export const badge = (total: number) => (total > 99 ? "99+" : total > 0 ? String(total) : undefined);
