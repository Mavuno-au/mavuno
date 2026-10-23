"use client";

import { createContext, use, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import type { RealtimePostgresInsertPayload } from "@supabase/supabase-js";
import { refreshCounts } from "@/app/actions/shell";
import { getBrowserClient } from "@/lib/supabase/browser";

type Counts = { notifications: number; messages: number };
type Store = Counts & { clear: (kind: keyof Counts) => void; refresh: () => void };

const CountsContext = createContext<Store>({ notifications: 0, messages: 0, clear: () => {}, refresh: () => {} });

// Unread counts arrive over Realtime (row level security filters them) and are
// re-read every minute in case a socket drops.
export function LiveCounts({ viewerId, initial, children }: { viewerId: string | null; initial: Counts; children: ReactNode }) {
  const [counts, setCounts] = useState(initial);
  // Offline, the counts stay as they were until the next read works.
  const refresh = useCallback(() => {
    refreshCounts().then(setCounts, () => undefined);
  }, []);

  useEffect(() => {
    if (!viewerId) return;
    const supabase = getBrowserClient();
    const channel = supabase
      .channel(`counts:${viewerId}`, { config: { private: true } })
      // The badge counts groups, so a fresh like on an already-liked post
      // changes nothing: the database says.
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: `recipient_id=eq.${viewerId}` }, refresh)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, (payload: RealtimePostgresInsertPayload<{ sender_id: string | null }>) => {
        // The database leaves out muted, archived and already-read conversations.
        if (payload.new.sender_id !== viewerId) refresh();
      })
      .subscribe();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") refresh();
    }, 60_000);
    return () => {
      clearInterval(timer);
      void supabase.removeChannel(channel);
    };
  }, [viewerId, refresh]);

  const clear = useCallback((kind: keyof Counts) => setCounts((current) => (current[kind] === 0 ? current : { ...current, [kind]: 0 })), []);
  const store = useMemo(() => ({ ...counts, clear, refresh }), [counts, clear, refresh]);
  return <CountsContext value={store}>{children}</CountsContext>;
}

export function useCounts() {
  return use(CountsContext);
}

export function ClearCount({ kind }: { kind: keyof Counts }) {
  const { clear } = useCounts();
  useEffect(() => clear(kind), [clear, kind]);
  return null;
}
