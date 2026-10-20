import { z } from "zod";
import { DISPLAY_TIME_ZONE } from "@/lib/format";

// The /operations ranges: the last 7 or 30 Sydney days, compared with as many
// days just before. See PRODUCT_METRICS.md.
export const RANGES = [7, 30] as const;
export type Range = (typeof RANGES)[number];
export const DEFAULT_RANGE: Range = 30;

export const rangeSchema = z.union([z.literal(7), z.literal(30)]);

export function parseRange(value: unknown): Range {
  return z.coerce.number().pipe(rangeSchema).catch(DEFAULT_RANGE).parse(value);
}

export type Rate = { part: number; whole: number };

export function ratio({ part, whole }: Rate) {
  return whole === 0 ? null : part / whole;
}

// The move in whole percentage points, or null while either period has
// nothing to divide by.
export function pointsChange(current: Rate, previous: Rate) {
  const now = ratio(current);
  const before = ratio(previous);
  return now === null || before === null ? null : Math.round((now - before) * 100);
}

// The rate that fell furthest. Only a fall is highlighted: rates of different
// steps can't be compared with each other, only with their own past.
export function biggestDrop<Key extends string>(changes: { key: Key; points: number | null }[]): Key | null {
  let worst: { key: Key; points: number } | null = null;
  for (const { key, points } of changes) {
    if (points === null || points >= 0) continue;
    if (worst === null || points < worst.points) worst = { key, points };
  }
  return worst?.key ?? null;
}

export function sydneyDay(now = new Date()) {
  return now.toLocaleDateString("en-CA", { timeZone: DISPLAY_TIME_ZONE });
}

// Calendar arithmetic on YYYY-MM-DD, at noon UTC so no zone shifts the day.
export function addDays(day: string, days: number) {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export type Period = { from: string; to: string };

export function periods(range: Range, today: string): { current: Period; previous: Period } {
  const from = addDays(today, 1 - range);
  return {
    current: { from, to: today },
    previous: { from: addDays(from, -range), to: addDays(from, -1) },
  };
}

export function duration(minutes: number) {
  if (minutes < 1) return "under a minute";
  if (minutes < 60) return `${Math.round(minutes)} min`;
  const hours = minutes / 60;
  return `${hours < 10 ? Math.round(hours * 10) / 10 : Math.round(hours)} h`;
}
