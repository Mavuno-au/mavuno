"use client";

import { useSyncExternalStore } from "react";
import { THEME_SCRIPT } from "@/lib/theme";

const subscribe = () => () => {};

// Applies a saved dark theme before first paint so it never flashes light.
// The script only needs to run once, from the server's HTML. After hydration
// it's dropped, so React never has to create a <script> on the client (which
// would never run, and which React warns about).
export function ThemeScript() {
  const hydrated = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
  if (hydrated) return null;
  return <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />;
}
