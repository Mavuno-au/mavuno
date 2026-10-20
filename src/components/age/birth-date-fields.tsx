"use client";

import { useId, useState } from "react";
import { Input, Select } from "@/components/ui/field";
import { MONTHS } from "@/lib/age";

export function BirthDateFields({ autoFocus }: { autoFocus?: boolean }) {
  const id = useId();
  // Controlled, so a form action that fails doesn't clear what was typed.
  const [date, setDate] = useState({ day: "", month: "", year: "" });
  return (
    <fieldset className="grid gap-1.5">
      <legend className="mb-1.5 text-sm font-medium">Date of birth</legend>
      <div className="grid grid-cols-[4.5rem_1fr_5.5rem] gap-2">
        <div className="grid gap-1">
          <label htmlFor={`${id}-day`} className="text-xs text-ink-muted">
            Day
          </label>
          <Input id={`${id}-day`} name="day" value={date.day} onChange={(event) => setDate({ ...date, day: event.target.value })} inputMode="numeric" pattern="[0-9]{1,2}" maxLength={2} autoComplete="bday-day" required autoFocus={autoFocus} />
        </div>
        <div className="grid gap-1">
          <label htmlFor={`${id}-month`} className="text-xs text-ink-muted">
            Month
          </label>
          <Select id={`${id}-month`} name="month" autoComplete="bday-month" required value={date.month} onChange={(event) => setDate({ ...date, month: event.target.value })}>
            <option value="" disabled>
              Month
            </option>
            {MONTHS.map((month, index) => (
              <option key={month} value={index + 1}>
                {month}
              </option>
            ))}
          </Select>
        </div>
        <div className="grid gap-1">
          <label htmlFor={`${id}-year`} className="text-xs text-ink-muted">
            Year
          </label>
          <Input id={`${id}-year`} name="year" value={date.year} onChange={(event) => setDate({ ...date, year: event.target.value })} inputMode="numeric" pattern="[0-9]{4}" maxLength={4} autoComplete="bday-year" required />
        </div>
      </div>
      <p className="text-sm text-ink-muted">We use it only to check you're old enough to join, then delete it. It's never shown or stored.</p>
    </fieldset>
  );
}

export function Under16Support() {
  return (
    <ul className="grid gap-2 text-sm text-ink-muted">
      <li>
        Want to talk to someone? <a href="https://kidshelpline.com.au" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Kids Helpline</a> is free and
        confidential, any time: 1800 55 1800.
      </li>
      <li>
        <a href="https://www.esafety.gov.au/young-people" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">eSafety</a> explains the age rules for social media and
        where to get help online.
      </li>
    </ul>
  );
}
