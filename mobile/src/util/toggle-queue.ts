import { useCallback, useEffect, useRef } from "react";
import type { Result } from "@/lib/result";

// Taps on a like or follow button are answered on screen at once and sent to
// the server one at a time, as Bluesky's useToggleMutationQueue does. Two taps
// in a row that ask for the same state send one request; a tap that asks for
// the state the server already confirmed sends none. When every queued tap
// has been answered, `onSettled` gets the state the server confirmed, which
// is what the screen then shows: after a failure that is the old state.
export function useToggleQueue({ run, onSettled, onError }: { run: (on: boolean) => Promise<Result>; onSettled: (confirmed: boolean) => void; onError: (message: string, on: boolean) => void }) {
  const queue = useRef<boolean[]>([]);
  const busy = useRef(false);
  const latest = useRef({ run, onSettled, onError });
  const mounted = useRef(true);

  useEffect(() => {
    latest.current = { run, onSettled, onError };
  });

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const drain = useCallback(async (confirmed: boolean) => {
    busy.current = true;
    let state = confirmed;
    try {
      while (queue.current.length > 0) {
        // Only the last tap matters; the ones before it were overtaken.
        const wanted = queue.current[queue.current.length - 1];
        queue.current = [];
        if (wanted === undefined || wanted === state) continue;
        const result = await latest.current.run(wanted);
        if (!result.ok) {
          queue.current = [];
          if (mounted.current) latest.current.onError(result.error, wanted);
          break;
        }
        state = wanted;
      }
    } finally {
      busy.current = false;
      if (mounted.current) latest.current.onSettled(state);
    }
  }, []);

  // `confirmed` is the state the server last agreed to, as the screen shows it
  // before this tap; it seeds the queue only when nothing is in flight.
  return useCallback(
    (on: boolean, confirmed: boolean) => {
      queue.current.push(on);
      if (!busy.current) void drain(confirmed);
    },
    [drain],
  );
}
