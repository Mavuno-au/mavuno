"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useSyncExternalStore } from "react";
import { cn } from "@/lib/cn";
import { applyTheme, readTheme, subscribeToTheme, type Theme } from "@/lib/theme";

const NEXT: Record<Theme, Theme> = { system: "light", light: "dark", dark: "system" };
const LABEL: Record<Theme, string> = { system: "System", light: "Light", dark: "Dark" };
const ICON: Record<Theme, typeof Sun> = { system: Monitor, light: Sun, dark: Moon };

export function useTheme() {
  return useSyncExternalStore(subscribeToTheme, readTheme, (): Theme => "system");
}

export function ThemeToggle({ showLabel = false, className }: { showLabel?: boolean; className?: string }) {
  const theme = useTheme();
  const Icon = ICON[theme];
  return (
    <button
      type="button"
      onClick={() => applyTheme(NEXT[theme])}
      aria-label={`Theme: ${LABEL[theme]}. Switch to ${LABEL[NEXT[theme]]}`}
      title={`Theme: ${LABEL[theme]}`}
      className={cn("flex items-center gap-2 rounded-md p-2 text-sm text-ink-muted hover:bg-wash hover:text-ink [&_svg]:size-5", className)}
    >
      <Icon />
      {showLabel ? <span className="hidden min-w-14 text-left lg:inline">{LABEL[theme]}</span> : null}
    </button>
  );
}
