import { useEffect, useRef } from "react";
import { checkForUpdate } from "@/lib/version";

const MAX_WAIT = 10 * 60_000;
const GIVE_UP_AFTER = 8;

// Runs `task` every `every` milliseconds while the tab is on screen. Each
// failure doubles the wait, up to ten minutes, and asks whether Mavuno was
// redeployed; after eight in a row it stops, since a reload is what fixes a
// page that old. A success brings the wait back to normal.
export function usePoll(task: () => Promise<void>, every: number, enabled = true) {
  const latest = useRef(task);
  useEffect(() => {
    latest.current = task;
  }, [task]);

  useEffect(() => {
    if (!enabled) return;
    let failures = 0;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      timer = setTimeout(tick, Math.min(every * 2 ** failures, MAX_WAIT));
    };
    const tick = async () => {
      if (document.visibilityState === "visible") {
        try {
          await latest.current();
          failures = 0;
        } catch {
          failures += 1;
          void checkForUpdate();
          if (failures >= GIVE_UP_AFTER) return;
        }
      }
      if (!cancelled) schedule();
    };
    schedule();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [every, enabled]);
}
