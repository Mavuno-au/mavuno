import { z } from "zod";

// Online Safety Act 2021, Part 4A: social media accounts are for people 16 and
// older. Accounts deactivated for being younger are deleted after this many
// days unless a review reinstates them (purge_deactivated_accounts).
export const REVIEW_DAYS = 30;

export const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"] as const;

const part = (label: string, min: number, max: number) =>
  z.coerce.number(`Enter the ${label} you were born.`).int(`Enter the ${label} you were born.`).min(min, `Enter the ${label} you were born.`).max(max, `Enter the ${label} you were born.`);

// Three fields rather than a date picker, which is hard to use for dates
// decades back. The result is an ISO date, checked to exist (no 31 June).
export const birthDateSchema = z
  .object({ day: part("day", 1, 31), month: part("month", 1, 12), year: part("year", 1900, 9999) })
  .transform(({ day, month, year }) => ({ iso: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`, day, month, year }))
  .refine(({ iso, day }) => new Date(`${iso}T00:00:00Z`).getUTCDate() === day, "That date doesn't exist. Check the day and month.")
  .refine(({ iso }) => new Date(`${iso}T00:00:00Z`) <= new Date(), "Your date of birth can't be in the future.")
  .transform(({ iso }) => iso);

export const isoDateSchema = z.iso.date();

export const deletionDate = (deactivatedAt: string) => new Date(new Date(deactivatedAt).getTime() + REVIEW_DAYS * 86_400_000).toISOString();
