// Muting or blocking someone changes what every list should show. The list
// that did it can't reach the others, so each one listens and refreshes itself.
const listeners = new Set<() => void>();

export function emitRelationChanged() {
  for (const listener of listeners) listener();
}

export function onRelationChanged(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
