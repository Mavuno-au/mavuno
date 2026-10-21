"use client";

import { useRouter } from "next/navigation";
import { useEffect, type RefObject } from "react";
import { canStartSwipe, swipedTab } from "@/lib/swipe";

// Lets a sideways swipe over the element move to the previous or next tab.
// It listens on the DOM rather than through React, so touches inside dialogs
// shown in the top layer never reach it.
export function useSwipeTabs(ref: RefObject<HTMLElement | null>, hrefs: readonly string[], current: string) {
  const router = useRouter();

  useEffect(() => {
    const element = ref.current;
    if (!element || hrefs.length < 2) return;

    let start: { x: number; y: number; at: number } | null = null;

    const onTouchStart = (event: TouchEvent) => {
      const touch = event.touches[0];
      start = event.touches.length === 1 && touch !== undefined && startsSwipe(touch, event.target, element) ? { x: touch.clientX, y: touch.clientY, at: event.timeStamp } : null;
    };
    // A second finger means a pinch, not a swipe.
    const onTouchMove = (event: TouchEvent) => {
      if (event.touches.length > 1) start = null;
    };
    const onTouchEnd = (event: TouchEvent) => {
      const touch = event.changedTouches[0];
      const from = start;
      start = null;
      if (!from || touch === undefined || hasSelectedText()) return;
      const href = swipedTab(hrefs, current, touch.clientX - from.x, touch.clientY - from.y, event.timeStamp - from.at);
      if (href !== null) router.push(href, { scroll: false });
    };
    const onTouchCancel = () => {
      start = null;
    };

    element.addEventListener("touchstart", onTouchStart, { passive: true });
    element.addEventListener("touchmove", onTouchMove, { passive: true });
    element.addEventListener("touchend", onTouchEnd);
    element.addEventListener("touchcancel", onTouchCancel);
    return () => {
      element.removeEventListener("touchstart", onTouchStart);
      element.removeEventListener("touchmove", onTouchMove);
      element.removeEventListener("touchend", onTouchEnd);
      element.removeEventListener("touchcancel", onTouchCancel);
    };
  }, [ref, hrefs, current, router]);
}

// Sideways touches already mean something inside a field or over content
// that scrolls sideways, such as a row of photos.
function startsSwipe(touch: Touch, target: EventTarget | null, within: HTMLElement) {
  if (!canStartSwipe(touch.clientX, window.innerWidth, window.visualViewport?.scale ?? 1)) return false;
  for (let element = target instanceof Element ? target : null; element !== null && element !== within; element = element.parentElement) {
    if (element.matches("input, textarea, select, [contenteditable]") || scrollsSideways(element)) return false;
  }
  return true;
}

function scrollsSideways(element: Element) {
  return element.scrollWidth > element.clientWidth && ["auto", "scroll"].includes(getComputedStyle(element).overflowX);
}

function hasSelectedText() {
  return (window.getSelection()?.toString() ?? "") !== "";
}
