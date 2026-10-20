import { Avatar, colourVar } from "@/components/ui/avatar";
import type { Colour } from "@/lib/domain";

const SIZE = 50;
const STROKE = 2;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

// The composer's avatar with a ring in the author's colour: dashed while the
// post is empty, then filling clockwise as it grows. Logarithmic, so the first
// words visibly count and the ring only closes at the limit; red past it.
export function ProgressAvatar({ person, length, limit }: { person: { displayName: string; avatarUrl: string | null; colour: Colour; accountType: "person" | "organisation" }; length: number; limit: number }) {
  const progress = Math.min(1, Math.log1p(length) / Math.log1p(limit));
  const over = length > limit;
  const colour = over ? "var(--destructive)" : colourVar(person.colour);

  return (
    <span className="relative flex size-[50px] shrink-0 items-center justify-center">
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="absolute inset-0 -rotate-90" aria-hidden>
        {length === 0 ? (
          <circle cx={SIZE / 2} cy={SIZE / 2} r={RADIUS} fill="none" stroke={colour} strokeWidth={STROKE} strokeDasharray="3.2 3.2" />
        ) : (
          <>
            <circle cx={SIZE / 2} cy={SIZE / 2} r={RADIUS} fill="none" stroke="var(--hairline)" strokeWidth={STROKE} />
            <circle
              cx={SIZE / 2}
              cy={SIZE / 2}
              r={RADIUS}
              fill="none"
              stroke={colour}
              strokeWidth={STROKE}
              strokeLinecap="round"
              strokeDasharray={`${CIRCUMFERENCE * (over ? 1 : progress)} ${CIRCUMFERENCE}`}
              className="transition-[stroke-dasharray] duration-200 ease-out"
            />
          </>
        )}
      </svg>
      <Avatar person={person} />
    </span>
  );
}
