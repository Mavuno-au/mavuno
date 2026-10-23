"use client";

import { useRef, type ReactNode } from "react";
import { useSwipeTabs } from "@/lib/use-swipe-tabs";

// Wraps what sits under a row of tabs so a sideways swipe on a touch screen
// switches tabs. Inside, only vertical panning and pinch-zoom are left to the
// browser, so the swipe is never also read as a horizontal scroll or a back gesture.
export function SwipeTabs({ hrefs, current, children }: { hrefs: readonly string[]; current: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useSwipeTabs(ref, hrefs, current);
  return (
    <div ref={ref} className={hrefs.length > 1 ? "touch-pan-y touch-pinch-zoom overscroll-x-contain" : undefined}>
      {children}
    </div>
  );
}
