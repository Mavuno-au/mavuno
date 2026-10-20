"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { getBrowserClient } from "@/lib/supabase/browser";

const REFRESH_EVERY_MS = 3_000;

// Re-renders the inbox when a message arrives in any of the viewer's
// conversations (row level security filters the stream) or the tab comes back.
export function LiveInbox({ viewerId }: { viewerId: string }) {
  const router = useRouter();

  useEffect(() => {
    let last = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const refresh = () => {
      if (timer) return;
      timer = setTimeout(
        () => {
          timer = null;
          last = Date.now();
          router.refresh();
        },
        Math.max(0, last + REFRESH_EVERY_MS - Date.now()),
      );
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };

    const supabase = getBrowserClient();
    const channel = supabase.channel(`inbox:${viewerId}`).on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, refresh).subscribe();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
      void supabase.removeChannel(channel);
    };
  }, [router, viewerId]);

  return null;
}
