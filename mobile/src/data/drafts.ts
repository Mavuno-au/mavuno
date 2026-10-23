import { findPersonalInfo } from "@/lib/personal-info";
import { supabase } from "@/data/supabase";

// Unsent posts and messages are kept on this phone, one per place they were
// started, as the website keeps them per browser (src/lib/use-draft.ts). A
// draft with a phone, card or bank number in it is never kept.
const key = (viewerId: string, scope: string) => `mavuno-draft.${viewerId}.${scope}`;

// Who is signed in, as Auth says before any screen hears of it. A screen
// that keeps its draft as it unmounts after signing out has cleared drafts
// would otherwise write one back.
let signedIn: string | null = null;
supabase.auth.onAuthStateChange((_event, session) => {
  signedIn = session?.user.id ?? null;
});

export function readDraft(viewerId: string, scope: string) {
  return localStorage.getItem(key(viewerId, scope)) ?? "";
}

export function keepDraft(viewerId: string, scope: string, body: string): boolean {
  if (viewerId !== signedIn) return false;
  if (!body.trim() || findPersonalInfo(body).length > 0) {
    localStorage.removeItem(key(viewerId, scope));
    return false;
  }
  localStorage.setItem(key(viewerId, scope), body);
  return true;
}

export function clearDraft(viewerId: string, scope: string) {
  localStorage.removeItem(key(viewerId, scope));
}

// Signing out leaves nothing of one member's writing for the next.
export function clearDrafts() {
  for (let index = localStorage.length - 1; index >= 0; index--) {
    const stored = localStorage.key(index);
    if (stored?.startsWith("mavuno-draft.")) localStorage.removeItem(stored);
  }
}
