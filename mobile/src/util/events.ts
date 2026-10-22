// Screens that can't reach each other tell each other what happened through
// these. Each event is one set of listeners; `on` returns the way to stop listening.
export function createEvent() {
  const listeners = new Set<() => void>();
  return {
    emit() {
      for (const listener of listeners) listener();
    },
    on(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

// Tapping the feed you are already on, or the wordmark, scrolls the list on
// screen back to the top and refreshes it. The tab bar will send this too.
export const { emit: emitSoftReset, on: onSoftReset } = createEvent();

// Muting or blocking someone changes what every list should show, so each
// list rereads itself when it hears this.
export const { emit: emitRelationChanged, on: onRelationChanged } = createEvent();
