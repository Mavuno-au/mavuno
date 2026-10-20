// The server renders in this zone; <LocalTime> switches to the reader's own
// zone after hydration, so both sides agree on the first render.
export const DISPLAY_TIME_ZONE = "Australia/Sydney";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export function relativeTime(iso: string, now = Date.now(), timeZone = DISPLAY_TIME_ZONE) {
  const then = new Date(iso);
  const elapsed = now - then.getTime();
  if (elapsed < MINUTE) return "now";
  if (elapsed < HOUR) return `${Math.floor(elapsed / MINUTE)}m`;
  if (elapsed < DAY) return `${Math.floor(elapsed / HOUR)}h`;
  if (elapsed < 7 * DAY) return `${Math.floor(elapsed / DAY)}d`;
  const year = (date: Date) => date.toLocaleDateString("en-AU", { year: "numeric", timeZone });
  const sameYear = year(then) === year(new Date(now));
  return then.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: sameYear ? undefined : "numeric", timeZone });
}

export function fullDate(iso: string, timeZone = DISPLAY_TIME_ZONE) {
  return new Date(iso).toLocaleString("en-AU", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone,
    timeZoneName: "short",
  });
}

export function eventDate(iso: string, timeZone: string) {
  return new Date(iso).toLocaleString("en-AU", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    timeZone,
    timeZoneName: "short",
  });
}

const dayKey = (date: Date, timeZone: string) => date.toLocaleDateString("en-CA", { timeZone });

export function dayLabel(iso: string, now = new Date(), timeZone = DISPLAY_TIME_ZONE) {
  const date = new Date(iso);
  if (dayKey(date, timeZone) === dayKey(now, timeZone)) return "Today";
  if (dayKey(date, timeZone) === dayKey(new Date(now.getTime() - DAY), timeZone)) return "Yesterday";
  return date.toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short", timeZone });
}

export function count(value: number, singular: string, plural = `${singular}s`) {
  return `${compact(value)} ${value === 1 ? singular : plural}`;
}

export function compact(value: number) {
  return new Intl.NumberFormat("en-AU", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

// "Followed by A, B and 3 others you follow". Up to three names are listed in
// full; past that, two names and a count.
export function followedBy(names: readonly string[], total: number) {
  const listed = total <= 3 ? names.slice(0, total) : names.slice(0, 2);
  const others = total - listed.length;
  const parts = others > 0 ? [...listed, `${others} ${others === 1 ? "other" : "others"} you follow`] : listed;
  if (parts.length === 0) return null;
  const last = parts.at(-1);
  return `Followed by ${parts.length === 1 ? last : `${parts.slice(0, -1).join(", ")} and ${last}`}`;
}

export function calendarDate(iso: string, timeZone = DISPLAY_TIME_ZONE) {
  return new Date(iso).toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric", timeZone });
}
