import "server-only";

const windows = new Map<string, number[]>();

// A per-instance sliding window. Enough to stop one person hammering an
// expensive endpoint; the database enforces the limits that must be exact.
export function allow(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const recent = (windows.get(key) ?? []).filter((time) => now - time < windowMs);
  if (recent.length >= limit) {
    windows.set(key, recent);
    return false;
  }
  recent.push(now);
  windows.set(key, recent);
  if (windows.size > 10_000) windows.clear();
  return true;
}
