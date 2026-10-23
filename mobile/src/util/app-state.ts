import { useEffect, useRef } from "react";
import { AppState } from "react-native";

// Coming back to the app after this long counts as a return worth acting on;
// a shorter trip (a notification, the share sheet) does not.
const SIGNIFICANT_RETURN = 2 * 60 * 1000;

// Calls `onReturn` when the app comes to the front after at least
// SIGNIFICANT_RETURN in the background. Only a real trip to the background
// counts: iOS reports "inactive" for Control Centre and the app switcher.
export function useSignificantReturn(onReturn: () => void) {
  const latest = useRef(onReturn);
  const left = useRef<number | null>(null);

  useEffect(() => {
    latest.current = onReturn;
  });

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "background") {
        left.current ??= Date.now();
        return;
      }
      if (state !== "active" || left.current === null) return;
      const away = Date.now() - left.current;
      left.current = null;
      if (away >= SIGNIFICANT_RETURN) latest.current();
    });
    return () => subscription.remove();
  }, []);
}
