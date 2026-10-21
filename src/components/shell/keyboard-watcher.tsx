"use client";

import { useEffect } from "react";
import { isKeyboardOpen, raisesKeyboard } from "@/lib/keyboard";

// How much of the screen the on-screen keyboard leaves visible. Dialogs and
// the messages composer use these to stay above it, and the bottom nav hides
// while it's open (data-keyboard-open).
export function KeyboardWatcher() {
  useEffect(() => {
    const view = window.visualViewport;
    if (!view) return;
    const root = document.documentElement;
    const update = () => {
      root.style.setProperty("--visual-viewport-top", `${view.offsetTop}px`);
      root.style.setProperty("--visual-viewport-height", `${view.height}px`);
      root.style.setProperty("--visual-viewport-bottom", `${Math.max(0, window.innerHeight - view.offsetTop - view.height)}px`);
      // Scaling by the zoom keeps a pinch from reading as a keyboard.
      const hidden = window.innerHeight - view.height * view.scale;
      root.toggleAttribute("data-keyboard-open", isKeyboardOpen(root.hasAttribute("data-keyboard-open"), raisesKeyboard(document.activeElement), hidden));
    };
    update();
    view.addEventListener("resize", update);
    view.addEventListener("scroll", update);
    document.addEventListener("focusin", update);
    return () => {
      view.removeEventListener("resize", update);
      view.removeEventListener("scroll", update);
      document.removeEventListener("focusin", update);
    };
  }, []);
  return null;
}
