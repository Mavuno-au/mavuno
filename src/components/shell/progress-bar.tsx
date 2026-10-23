"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useSyncExternalStore } from "react";

// A thin line along the top while a page is on its way. It starts after a
// short beat, so a page that arrives at once never shows it, creeps towards
// the end while waiting, and finishes when the address changes.
const SHOW_AFTER_MS = 150;
const GIVE_UP_MS = 12_000;

type State = { phase: "idle" | "loading" | "done"; width: number };

const IDLE: State = { phase: "idle", width: 0 };
let state = IDLE;
let pending = false;
let timers: ReturnType<typeof setTimeout>[] = [];
const listeners = new Set<() => void>();

function set(next: State) {
  state = next;
  for (const notify of listeners) notify();
}

function clearTimers() {
  for (const timer of timers) clearTimeout(timer);
  timers = [];
}

function reset() {
  clearTimers();
  set(IDLE);
}

function begin() {
  pending = true;
  clearTimers();
  // A fast navigation finishes before this fires.
  timers.push(
    setTimeout(() => {
      if (!pending) return;
      set({ phase: "loading", width: 15 });
      timers.push(setInterval(() => set({ phase: "loading", width: state.width + (90 - state.width) * 0.12 }), 400));
      timers.push(setTimeout(reset, GIVE_UP_MS));
    }, SHOW_AFTER_MS),
  );
}

function finish() {
  pending = false;
  if (state.phase !== "loading") return clearTimers();
  clearTimers();
  set({ phase: "done", width: 100 });
  timers.push(setTimeout(reset, 350));
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// Next's Link prevents the default, so a click it handled is one that stays
// in the app; a full page load has the browser's own indicator.
function navigatesWithin(event: MouseEvent) {
  if (!event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return false;
  const anchor = event.target instanceof Element ? event.target.closest("a[href]") : null;
  if (!(anchor instanceof HTMLAnchorElement) || anchor.hasAttribute("download") || (anchor.target && anchor.target !== "_self")) return false;
  const url = new URL(anchor.href, window.location.href);
  return url.origin === window.location.origin && (url.pathname !== window.location.pathname || url.search !== window.location.search);
}

export function ProgressBar() {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const { phase, width } = useSyncExternalStore(subscribe, () => state, () => IDLE);

  // The address changing is what finishes a navigation.
  useEffect(() => finish(), [pathname, search]);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (navigatesWithin(event)) begin();
    };
    // Back to a #section on the same page changes nothing the bar waits for.
    let shown = location.pathname + location.search;
    const onPopState = () => {
      const next = location.pathname + location.search;
      if (next !== shown) begin();
      shown = next;
    };
    const onNavigate = () => {
      shown = location.pathname + location.search;
    };
    document.addEventListener("click", onClick);
    window.addEventListener("popstate", onPopState);
    window.addEventListener("hashchange", onNavigate);
    return () => {
      document.removeEventListener("click", onClick);
      window.removeEventListener("popstate", onPopState);
      window.removeEventListener("hashchange", onNavigate);
    };
  }, []);

  return (
    <div aria-hidden className="pointer-events-none fixed inset-x-0 top-0 z-[60] h-0.5">
      <div
        className="h-full bg-primary"
        style={{
          width: `${width}%`,
          opacity: phase === "idle" ? 0 : 1,
          transition: phase === "idle" ? "opacity 200ms ease-out" : "width 300ms ease-out, opacity 100ms ease-out",
        }}
      />
    </div>
  );
}
