"use client";

import { useSyncExternalStore } from "react";
import { DISPLAY_TIME_ZONE, fullDate, relativeTime } from "@/lib/format";

const subscribeToNothing = () => () => {};
const deviceZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

// The reader's time zone: Sydney while rendering on the server and hydrating,
// then the device's own zone.
export function useTimeZone() {
  return useSyncExternalStore(subscribeToNothing, deviceZone, () => DISPLAY_TIME_ZONE);
}

// One clock for every relative time on the page, ticking each minute so "5m"
// becomes "6m" without anything re-rendering on its own.
const MINUTE = 60_000;
let now = Date.now();
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | undefined;

function subscribeToClock(listener: () => void) {
  listeners.add(listener);
  timer ??= setInterval(() => {
    now = Date.now();
    for (const notify of listeners) notify();
  }, MINUTE);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      clearInterval(timer);
      timer = undefined;
    }
  };
}

export function useNow() {
  return useSyncExternalStore(subscribeToClock, () => now, () => now);
}

export function LocalTime({ iso, format = "relative" }: { iso: string; format?: "relative" | "full" }) {
  const timeZone = useTimeZone();
  const current = useNow();
  return (
    <time dateTime={iso} title={fullDate(iso, timeZone)} suppressHydrationWarning>
      {format === "relative" ? relativeTime(iso, current, timeZone) : fullDate(iso, timeZone)}
    </time>
  );
}
