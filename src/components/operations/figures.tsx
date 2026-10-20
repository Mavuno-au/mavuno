import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { dayLabel } from "@/lib/format";

// Whole percent, or a dash when there is nothing to divide by yet.
export function share(part: number, whole: number) {
  return whole === 0 ? "–" : `${Math.round((part / whole) * 100)}%`;
}

export function StatGrid({ children }: { children: ReactNode }) {
  return <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-hairline bg-hairline sm:grid-cols-4">{children}</dl>;
}

export function Stat({ label, value, note }: { label: string; value: ReactNode; note?: ReactNode }) {
  return (
    <div className="grid content-start gap-1 bg-surface px-4 py-3">
      <dt className="text-sm text-ink-muted">{label}</dt>
      <dd className="font-mono text-2xl font-semibold tracking-tight tabular">{value}</dd>
      {note ? <dd className="text-xs text-ink-muted">{note}</dd> : null}
    </div>
  );
}

// A labelled share with a bar, e.g. "Posted on day one · 42% · 21 of 50".
export function ShareRow({ label, part, whole, hint }: { label: string; part: number; whole: number; hint?: string }) {
  const width = whole === 0 ? 0 : Math.round((part / whole) * 100);
  return (
    <div className="grid gap-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[15px]">
          {label}
          {hint ? <span className="block text-xs text-ink-muted">{hint}</span> : null}
        </span>
        <span className="shrink-0 text-right">
          <span className="font-mono font-semibold tabular">{share(part, whole)}</span>
          <span className="ml-2 font-mono text-xs text-ink-muted tabular">
            {part} of {whole}
          </span>
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-wash" aria-hidden>
        <div className="h-full rounded-full bg-primary" style={{ width: `${width}%` }} />
      </div>
    </div>
  );
}

// One bar per day; the table underneath is what screen readers get.
export function DailyBars({ title, days, className }: { title: string; days: { day: string; value: number }[]; className?: string }) {
  const peak = Math.max(1, ...days.map((entry) => entry.value));
  const total = days.reduce((sum, entry) => sum + entry.value, 0);
  const first = days[0];
  const last = days.at(-1);
  return (
    <figure className={cn("grid gap-2", className)}>
      <figcaption className="flex items-baseline justify-between gap-3 text-sm">
        <span className="font-medium">{title}</span>
        <span className="font-mono text-xs text-ink-muted tabular">
          {total} in {days.length} days · peak {peak}
        </span>
      </figcaption>
      <div className="flex h-20 items-end gap-[3px]" aria-hidden>
        {days.map((entry) => (
          <div
            key={entry.day}
            title={`${dayLabel(`${entry.day}T12:00:00Z`)}: ${entry.value}`}
            className={cn("min-h-px flex-1 rounded-t-sm", entry.value === 0 ? "bg-hairline" : "bg-primary")}
            style={{ height: `${Math.max(2, (entry.value / peak) * 100)}%` }}
          />
        ))}
      </div>
      {first && last ? (
        <div className="flex justify-between font-mono text-[11px] text-ink-muted" aria-hidden>
          <span>{dayLabel(`${first.day}T12:00:00Z`)}</span>
          <span>{dayLabel(`${last.day}T12:00:00Z`)}</span>
        </div>
      ) : null}
      {/* Tables ignore sr-only's 1px box, so a hidden one still stretches the page; the div clips it. */}
      <div className="sr-only">
        <table>
          <caption>{title} per day</caption>
          <tbody>
            {days.map((entry) => (
              <tr key={entry.day}>
                <th scope="row">{entry.day}</th>
                <td>{entry.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  );
}
