import { useSyncExternalStore } from "react";
import { Appearance } from "react-native";
import { z } from "zod";
import { DEFAULT_REPLY_PREVIEWS, REPLY_PREVIEW_CHOICES } from "@/lib/reply-previews";

// Appearance choices kept on this phone, as the website keeps them per browser.
const themeSchema = z.enum(["system", "light", "dark"]);
export type Theme = z.infer<typeof themeSchema>;

const preferencesSchema = z.object({
  theme: themeSchema.catch("system"),
  replyPreviews: z
    .number()
    .refine((count) => REPLY_PREVIEW_CHOICES.some((choice) => choice === count))
    .catch(DEFAULT_REPLY_PREVIEWS),
});
export type Preferences = z.infer<typeof preferencesSchema>;

const KEY = "mavuno-preferences";
const listeners = new Set<() => void>();

function read(): Preferences {
  try {
    return preferencesSchema.parse(JSON.parse(localStorage.getItem(KEY) ?? "{}"));
  } catch {
    return preferencesSchema.parse({});
  }
}

let current = read();

const applyTheme = (theme: Theme) => Appearance.setColorScheme(theme === "system" ? "unspecified" : theme);
applyTheme(current.theme);

export function setPreference<Key extends keyof Preferences>(key: Key, value: Preferences[Key]) {
  current = { ...current, [key]: value };
  localStorage.setItem(KEY, JSON.stringify(current));
  if (key === "theme") applyTheme(current.theme);
  for (const listener of listeners) listener();
}

export const preferences = () => current;

export function usePreferences() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => current,
  );
}
