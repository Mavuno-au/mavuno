import Link from "next/link";
import { cn } from "@/lib/cn";
import { RANGES, type Range } from "@/lib/metrics";

export function RangePicker({ range, path, note }: { range: Range; path: string; note?: string }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-hairline px-4 py-3 sm:px-6">
      <nav aria-label="Range" className="inline-flex rounded-md border border-rail p-0.5">
        {RANGES.map((days) => (
          <Link
            key={days}
            href={`${path}?range=${days}`}
            scroll={false}
            aria-current={days === range ? "page" : undefined}
            className={cn(
              "min-w-28 rounded-[5px] px-3 py-1 text-center text-sm font-medium transition-colors",
              days === range ? "bg-primary-soft text-primary" : "text-ink-muted hover:bg-wash hover:text-ink",
            )}
          >
            Last {days} days
          </Link>
        ))}
      </nav>
      {note ? <p className="text-xs text-ink-muted">{note}</p> : null}
    </div>
  );
}
