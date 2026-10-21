import { recentSearchesKey } from "@/lib/recent-searches";

// What Mavuno keeps in a browser for one signed-in person: unsent drafts,
// where they left off in each feed and their last few searches. Signing out
// removes all of it.
export const draftPrefix = (viewerId: string) => `mavuno:draft:${viewerId}:`;
export const lastVisitKey = (viewerId: string, feed: string) => `mavuno:last-visit:${viewerId}:${feed}`;

export function forgetBrowserData(viewerId: string) {
  try {
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith(draftPrefix(viewerId)) || key.startsWith(`mavuno:last-visit:${viewerId}:`) || key === recentSearchesKey(viewerId)) localStorage.removeItem(key);
    }
  } catch {}
}
