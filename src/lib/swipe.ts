// Phones use swipes that start at the screen's edge for back and forward.
export const SCREEN_EDGE = 24;
// A swipe has to travel this far, mostly sideways, inside this long.
export const SWIPE_MIN = 60;
export const SWIPE_MAX_MS = 800;

// Whether a touch at x can begin a tab swipe: not from the edge, and not
// while pinched in, when a sideways drag pans the page instead.
export function canStartSwipe(x: number, width: number, scale: number) {
  return x >= SCREEN_EDGE && x <= width - SCREEN_EDGE && scale <= 1;
}

// The tab a swipe lands on, or null. Swiping left drags the next tab into
// view. The swipe must be clearly sideways, so scrolling the feed at an
// angle never changes tabs, and quick, so a slow drag doesn't either.
export function swipedTab<T>(tabs: readonly T[], current: T, deltaX: number, deltaY: number, durationMs: number): T | null {
  if (durationMs > SWIPE_MAX_MS || Math.abs(deltaX) < SWIPE_MIN || Math.abs(deltaX) < Math.abs(deltaY) * 2) return null;
  const index = tabs.indexOf(current);
  if (index === -1) return null;
  return tabs[index + (deltaX < 0 ? 1 : -1)] ?? null;
}
