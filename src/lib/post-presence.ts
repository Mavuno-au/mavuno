// Whether the post a page is about is still there: present, deleted (a
// tombstone keeps its replies), or unavailable to this reader (held for
// review, its author blocked them, or the account is gone).
export type Presence = { kind: "present" } | { kind: "deleted" } | { kind: "unavailable" };

// The database keeps a deleted post's content for 30 seconds so Undo works.
export const UNDO_WINDOW_MS = 30_000;

// Deleting your own post on its page shows an Undo in place, so the cover
// waits until that chance has passed.
export function shouldCover(presence: Presence, ownDeletedAt: number | null, now: number): boolean {
  switch (presence.kind) {
    case "present":
      return false;
    case "deleted":
      return ownDeletedAt === null || now - ownDeletedAt > UNDO_WINDOW_MS;
    case "unavailable":
      return true;
  }
}

// Posts the reader deleted themselves in this tab, by when; cleared on Undo.
const ownDeletions = new Map<string, number>();

export function markOwnDeletion(postId: string, at = Date.now()) {
  ownDeletions.set(postId, at);
}

export function clearOwnDeletion(postId: string) {
  ownDeletions.delete(postId);
}

export function ownDeletionAt(postId: string) {
  return ownDeletions.get(postId) ?? null;
}
