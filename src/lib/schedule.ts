// A time chosen in the composer, in the browser's own time zone.
export type ScheduleDraft = { date: string; hour: number; minute: number };

export const MAX_SCHEDULE_DAYS = 30;
export const MINUTE_STEP = 5;

const pad = (value: number) => String(value).padStart(2, "0");

export const localDate = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

export function scheduledDate(draft: ScheduleDraft) {
  const [year = 0, month = 1, day = 1] = draft.date.split("-").map(Number);
  return new Date(year, month - 1, day, draft.hour, draft.minute);
}

// The top of the next hour, the first time most people would reach for.
export function initialSchedule(now: Date): ScheduleDraft {
  const next = new Date(now);
  next.setHours(next.getHours() + 1, 0, 0, 0);
  return { date: localDate(next), hour: next.getHours(), minute: 0 };
}

export function lastScheduleDay(now: Date) {
  return localDate(new Date(now.getFullYear(), now.getMonth(), now.getDate() + MAX_SCHEDULE_DAYS));
}

export function scheduleProblem(draft: ScheduleDraft, now: Date): string | null {
  const when = scheduledDate(draft);
  if (Number.isNaN(when.getTime())) return "Choose a date.";
  // A time the clocks skip, like 2:30 am when daylight saving starts, comes back shifted.
  if (localDate(when) !== draft.date || when.getHours() !== draft.hour || when.getMinutes() !== draft.minute) {
    return "That time doesn't exist here because the clocks change. Choose another time.";
  }
  if (when.getTime() <= now.getTime()) return "Choose a time in the future.";
  if (when.getTime() > now.getTime() + MAX_SCHEDULE_DAYS * 86_400_000) return `You can schedule up to ${MAX_SCHEDULE_DAYS} days ahead.`;
  return null;
}

export function utcOffset(when: Date) {
  return new Intl.DateTimeFormat("en-AU", { timeZoneName: "shortOffset" }).formatToParts(when).find((part) => part.type === "timeZoneName")?.value ?? "";
}
