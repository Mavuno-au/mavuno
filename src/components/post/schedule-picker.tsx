"use client";

import Link from "next/link";
import { useId } from "react";
import { localDate, lastScheduleDay, MAX_SCHEDULE_DAYS, MINUTE_STEP, scheduledDate, utcOffset, type ScheduleDraft } from "@/lib/schedule";

const HOURS = Array.from({ length: 24 }, (_, hour) => hour);
const MINUTES = Array.from({ length: 60 / MINUTE_STEP }, (_, index) => index * MINUTE_STEP);
const hourLabel = new Intl.DateTimeFormat("en-AU", { hour: "numeric" });

const field = "h-9 rounded-md border border-rail bg-surface px-2 text-base focus:border-primary focus:outline-none sm:text-sm";

export function SchedulePicker({ value, onChange, now, problem }: { value: ScheduleDraft; onChange: (value: ScheduleDraft) => void; now: Date; problem: string | null }) {
  const id = useId();
  const today = localDate(now) === value.date;
  const thisHour = today && value.hour === now.getHours();
  const when = scheduledDate(value);
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  return (
    <fieldset className="mt-2 grid gap-2 rounded-lg border border-hairline p-3" aria-describedby={`${id}-help ${id}-problem`}>
      <legend className="sr-only">Schedule</legend>
      <div className="flex flex-wrap items-center gap-2">
        <label className="contents">
          <span className="text-sm font-medium">Post on</span>
          <input
            type="date"
            required
            value={value.date}
            min={localDate(now)}
            max={lastScheduleDay(now)}
            aria-invalid={problem ? true : undefined}
            onChange={(event) => onChange({ ...value, date: event.target.value })}
            className={field}
          />
        </label>
        <span className="text-sm font-medium">at</span>
        <select aria-label="Hour" value={value.hour} onChange={(event) => onChange({ ...value, hour: Number(event.target.value) })} className={`${field} tabular`}>
          {HOURS.map((hour) => (
            <option key={hour} value={hour} disabled={today && hour < now.getHours()}>
              {hourLabel.format(new Date(2000, 0, 1, hour))}
            </option>
          ))}
        </select>
        <select aria-label="Minute" value={value.minute} onChange={(event) => onChange({ ...value, minute: Number(event.target.value) })} className={`${field} font-mono tabular`}>
          {MINUTES.map((minute) => (
            <option key={minute} value={minute} disabled={thisHour && minute <= now.getMinutes()}>
              :{String(minute).padStart(2, "0")}
            </option>
          ))}
        </select>
      </div>
      <p id={`${id}-help`} className="text-xs text-ink-muted">
        <span className="font-mono">
          {zone}
          {Number.isNaN(when.getTime()) ? "" : ` (${utcOffset(when)})`}
        </span>
        . Up to {MAX_SCHEDULE_DAYS} days ahead. Only you can see it until it goes out.{" "}
        <Link href="/scheduled" className="font-medium text-primary hover:underline">
          Scheduled posts
        </Link>
      </p>
      <p id={`${id}-problem`} role="alert" className="text-xs text-destructive empty:hidden">
        {problem}
      </p>
    </fieldset>
  );
}
