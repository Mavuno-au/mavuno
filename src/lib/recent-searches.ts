import { findPersonalInfo } from "@/lib/personal-info";

// The last few searches, kept in this browser only and never sent anywhere.
// A term that looks like someone's phone number, email address or other
// personal details is never kept, the same as drafts.
export const RECENT_SEARCHES = 3;
export const MAX_TERM_LENGTH = 100;

export const recentSearchesKey = (viewerId: string) => `mavuno:recent-searches:${viewerId}`;

export function rememberSearch(recent: readonly string[], term: string): string[] {
  const cleaned = term.trim().replace(/\s+/g, " ");
  if (cleaned === "" || cleaned.length > MAX_TERM_LENGTH || findPersonalInfo(cleaned).length > 0) return [...recent];
  const kept = recent.filter((item) => item.toLowerCase() !== cleaned.toLowerCase());
  return [cleaned, ...kept].slice(0, RECENT_SEARCHES);
}

export function readRecentSearches(key: string): string[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(key) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string").slice(0, RECENT_SEARCHES) : [];
  } catch {
    return [];
  }
}

export function writeRecentSearches(key: string, recent: readonly string[]) {
  try {
    if (recent.length === 0) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(recent));
  } catch {}
}
