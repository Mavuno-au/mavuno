import Link from "next/link";
import { MARK } from "@/lib/brand-mark";
import { cn } from "@/lib/cn";

const { bounds } = MARK;
const viewBox = `${bounds.x} ${bounds.y} ${bounds.width} ${bounds.height}`;

// A shoot growing from its seed: "mavuno" is Swahili for harvest.
export function Mark({ className }: { className?: string }) {
  return (
    <svg viewBox={viewBox} aria-hidden className={cn("h-6 w-auto text-primary", className)}>
      <g fill="currentColor">
        <rect {...MARK.stem} />
        {MARK.leaves.map((leaf) => (
          <path key={leaf.transform} d={leaf.d} transform={leaf.transform} />
        ))}
      </g>
      <circle {...MARK.seed} fill="var(--colour-1)" />
    </svg>
  );
}

export function Wordmark({ href = "/", className }: { href?: string; className?: string }) {
  return (
    <Link href={href} className={cn("inline-flex items-center gap-2 rounded-md", className)} aria-label="Mavuno home">
      <Mark />
      <span className="text-xl font-bold tracking-tight">mavuno</span>
    </Link>
  );
}
