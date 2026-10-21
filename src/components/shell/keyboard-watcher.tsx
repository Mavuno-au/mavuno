"use client";

import { useEffect } from "react";

// How much of the screen the on-screen keyboard leaves visible. Dialogs and
// the messages composer use these to stay above it, and the bottom nav hides
// while it's open (data-keyboard-open).
const KEYBOARD_MIN = 120;

export function KeyboardWatcher() {
  useEffect(() => {
    const view = window.visualViewport;
    if (!view) return;
    const root = document.documentElement;
    const update = () => {
      root.style.setProperty("--visual-viewport-top", `${view.offsetTop}px`);
      root.style.setProperty("--visual-viewport-height", `${view.height}px`);
      root.style.setProperty("--visual-viewport-bottom", `${Math.max(0, window.innerHeight - view.offsetTop - view.height)}px`);
      const typing = document.activeElement instanceof HTMLElement && document.activeElement.matches("input, textarea, select, [contenteditable]");
      root.toggleAttribute("data-keyboard-open", typing && window.innerHeight - view.height > KEYBOARD_MIN);
    };
    update();
    view.addEventListener("resize", update);
    view.addEventListener("scroll", update);
    document.addEventListener("focusin", update);
    document.addEventListener("focusout", update);
    return () => {
      view.removeEventListener("resize", update);
      view.removeEventListener("scroll", update);
      document.removeEventListener("focusin", update);
      document.removeEventListener("focusout", update);
    };
  }, []);
  return null;
}
