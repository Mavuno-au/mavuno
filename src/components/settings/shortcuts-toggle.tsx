"use client";

import { useSyncExternalStore } from "react";
import { Checkbox } from "@/components/ui/field";
import { applyShortcutsEnabled, readShortcutsEnabled, subscribeToShortcuts } from "@/lib/shortcuts";

export function ShortcutsToggle() {
  const enabled = useSyncExternalStore(subscribeToShortcuts, readShortcutsEnabled, () => true);
  return (
    <Checkbox
      label="Single-key shortcuts"
      hint="j and k move between posts, c writes a post, ? lists them all. Shortcuts with ⌘ or Ctrl stay on."
      checked={enabled}
      onChange={(event) => applyShortcutsEnabled(event.target.checked)}
    />
  );
}
