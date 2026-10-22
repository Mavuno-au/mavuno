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

// Deleting an account signs out on the server, so nothing in the browser runs
// the sign-out cleanup. The form notes whose account it is, and the page it
// lands on forgets that person's data. A deletion that fails leaves only the
// note, which the next one replaces.
const DELETING_KEY = "mavuno:deleting";

export function noteDeleting(viewerId: string) {
  try {
    sessionStorage.setItem(DELETING_KEY, viewerId);
  } catch {}
}

export function forgetDeletedAccount() {
  try {
    const viewerId = sessionStorage.getItem(DELETING_KEY);
    sessionStorage.removeItem(DELETING_KEY);
    if (viewerId) forgetBrowserData(viewerId);
  } catch {}
}
