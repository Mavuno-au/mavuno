import type { Colour } from "@/lib/domain";
import { cn } from "@/lib/cn";

type Person = { displayName: string; avatarUrl: string | null; colour: Colour; accountType?: "person" | "organisation" };

const SIZES = { xs: "size-5 text-[10px]", sm: "size-7 text-xs", md: "size-10 text-sm", lg: "size-14 text-lg", xl: "size-20 text-2xl" } as const;

export function colourVar(colour: Colour) {
  return `var(--colour-${colour})`;
}

// Organisations get rounded squares so they read differently from people at a glance.
export function Avatar({ person, size = "md", ring = false, className }: { person: Person; size?: keyof typeof SIZES; ring?: boolean; className?: string }) {
  const shape = person.accountType === "organisation" ? "rounded-[28%]" : "rounded-full";
  const style = ring ? { boxShadow: `0 0 0 2px var(--surface), 0 0 0 4px ${colourVar(person.colour)}` } : undefined;
  if (person.avatarUrl) {
    return <img src={person.avatarUrl} alt="" loading="lazy" decoding="async" style={style} className={cn(SIZES[size], shape, "shrink-0 bg-wash object-cover", className)} />;
  }
  return (
    <span
      aria-hidden
      style={{ ...style, backgroundColor: colourVar(person.colour) }}
      className={cn(SIZES[size], shape, "inline-flex shrink-0 items-center justify-center font-semibold text-white select-none", className)}
    >
      {initials(person.displayName)}
    </span>
  );
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? (parts.at(-1)?.[0] ?? "") : "")).toUpperCase() || "?";
}

export function ColourDot({ colour, className }: { colour: Colour; className?: string }) {
  return <span aria-hidden className={cn("inline-block size-2 shrink-0 rounded-full", className)} style={{ backgroundColor: colourVar(colour) }} />;
}
