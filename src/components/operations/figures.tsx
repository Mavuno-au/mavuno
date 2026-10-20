import type { ReactNode } from "react";
import { Chip } from "@/components/ui/page";
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

export type Change = { points: number | null; worst: boolean };

// The move since the period before, in percentage points. The rate that fell
// furthest is marked, since a level only means something against its own past.
function ChangeNote({ change }: { change: Change }) {
  if (change.points === null) return null;
  const points = `${change.points > 0 ? "+" : change.points < 0 ? "−" : "±"}${Math.abs(change.points)} pts`;
  const text = (
    <>
      {points}
      <span className="sr-only"> on the period before</span>
    </>
  );
  return change.worst ? (
    <Chip tone="warning" className="mt-1 font-mono tabular">
      {text} · fell most
    </Chip>
  ) : (
    <span className="mt-0.5 block font-mono text-xs text-ink-muted tabular">{text}</span>
  );
}

// A labelled share with a bar, e.g. "Posted on day one · 42% · 21 of 50".
export function ShareRow({ label, part, whole, hint, change }: { label: string; part: number; whole: number; hint?: ReactNode; change?: Change }) {
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
          {change ? <ChangeNote change={change} /> : null}
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-wash" aria-hidden>
        <div className="h-full rounded-full bg-primary" style={{ width: `${width}%` }} />
      </div>
    </div>
  );
}

// A labelled figure that isn't a share, e.g. a median.
export function ValueRow({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-[15px]">
        {label}
        {hint ? <span className="block text-xs text-ink-muted">{hint}</span> : null}
      </span>
      <span className="shrink-0 font-mono font-semibold tabular">{value}</span>
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

// The share of each day's sign-ups that reached a milestone. A day still
// counting is drawn lighter until all of its sign-ups have had their window.
export function RateBars({ title, days, note }: { title: string; days: { day: string; part: number; whole: number; complete: boolean }[]; note?: string }) {
  const part = days.reduce((sum, entry) => sum + entry.part, 0);
  const whole = days.reduce((sum, entry) => sum + entry.whole, 0);
  const first = days[0];
  const last = days.at(-1);
  return (
    <figure className="grid gap-2">
      <figcaption className="flex items-baseline justify-between gap-3 text-sm">
        <span className="font-medium">{title}</span>
        <span className="font-mono text-xs text-ink-muted tabular">
          {share(part, whole)} of {whole}
        </span>
      </figcaption>
      <div className="flex h-20 items-end gap-[3px]" aria-hidden>
        {days.map((entry) => (
          <div
            key={entry.day}
            title={`${dayLabel(`${entry.day}T12:00:00Z`)}: ${entry.whole === 0 ? "no sign-ups" : `${share(entry.part, entry.whole)} of ${entry.whole}`}${entry.complete ? "" : ", still counting"}`}
            className={cn("min-h-px flex-1 rounded-t-sm", entry.whole === 0 ? "bg-hairline" : entry.complete ? "bg-primary" : "bg-primary/35")}
            style={{ height: entry.whole === 0 ? "1px" : `${Math.max(2, (entry.part / entry.whole) * 100)}%` }}
          />
        ))}
      </div>
      {first && last ? (
        <div className="flex justify-between font-mono text-[11px] text-ink-muted" aria-hidden>
          <span>{dayLabel(`${first.day}T12:00:00Z`)}</span>
          <span>{dayLabel(`${last.day}T12:00:00Z`)}</span>
        </div>
      ) : null}
      {note ? <p className="text-xs text-ink-muted">{note}</p> : null}
      {/* Tables ignore sr-only's 1px box, so a hidden one still stretches the page; the div clips it. */}
      <div className="sr-only">
        <table>
          <caption>{title} per sign-up day</caption>
          <tbody>
            {days.map((entry) => (
              <tr key={entry.day}>
                <th scope="row">{entry.day}</th>
                <td>{entry.whole === 0 ? "No sign-ups" : `${entry.part} of ${entry.whole}`}</td>
                <td>{entry.complete ? "Complete" : "Still counting"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  );
}
