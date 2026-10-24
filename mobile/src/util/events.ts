import type { Relation } from "@/lib/relations";

// Screens that can't reach each other tell each other what happened through
// these. Each event is one set of listeners; `on` returns the way to stop listening.
export function createEvent<T = void>() {
  const listeners = new Set<(value: T) => void>();
  return {
    emit(value: T) {
      for (const listener of listeners) listener(value);
    },
    on(listener: (value: T) => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

// Tapping the feed you are already on, or the wordmark, scrolls the list on
// screen back to the top and refreshes it. So does tapping the tab you're on.
export const { emit: emitSoftReset, on: onSoftReset } = createEvent();

// Muting or blocking someone changes what every list should show: a list
// takes their posts out, and screens about them read again.
export type RelationChange = { profileId: string; relation: Relation; on: boolean };
export const { emit: emitRelationChanged, on: onRelationChanged } = createEvent<RelationChange>();

// Something a profile's header or pinned post shows has changed, such as a
// pin. Carries the profile's id.
export const { emit: emitProfileChanged, on: onProfileChanged } = createEvent<string>();

// A post the member just wrote, so the lists it belongs in can show it at once.
export type CreatedPost = { id: string; parentId: string | null; quoteId: string | null; spaceId: string | null; topics: string[] };
export const { emit: emitPostCreated, on: onPostCreated } = createEvent<CreatedPost>();
