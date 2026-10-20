"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "@/components/shell/theme-toggle";
import { cn } from "@/lib/cn";
import { applyTheme } from "@/lib/theme";

const THEMES = [
  { value: "light", label: "Light", icon: <Sun /> },
  { value: "dark", label: "Dark", icon: <Moon /> },
  { value: "system", label: "System", icon: <Monitor /> },
] as const;

export function ThemePicker() {
  const theme = useTheme();
  return (
    <fieldset>
      <legend className="sr-only">Theme</legend>
      <div className="grid grid-cols-3 gap-2">
        {THEMES.map((option) => (
          <label
            key={option.value}
            className={cn(
              "flex cursor-pointer flex-col items-center gap-2 rounded-lg border px-3 py-4 text-sm font-medium transition-colors has-focus-visible:ring-2 has-focus-visible:ring-primary [&_svg]:size-5",
              theme === option.value ? "border-primary bg-primary-soft text-primary" : "border-rail text-ink hover:bg-wash",
            )}
          >
            <input type="radio" name="theme" className="sr-only" checked={theme === option.value} onChange={() => applyTheme(option.value)} />
            {option.icon}
            {option.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
