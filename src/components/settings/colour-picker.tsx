"use client";

import { colourVar } from "@/components/ui/avatar";
import { COLOURS } from "@/lib/catalogue";
import { cn } from "@/lib/cn";
import type { Colour } from "@/lib/domain";

const SWATCHES = COLOURS.map((name, index) => ({ name, colour: index }));

// Automatic picks one of the six from the profile id, so it previews as all of them.
const AUTOMATIC = `conic-gradient(${SWATCHES.map(({ colour }) => colourVar(colour)).join(", ")}, ${colourVar(0)})`;

const swatch = "flex size-9 cursor-pointer items-center justify-center rounded-full ring-offset-2 ring-offset-surface transition-shadow peer-focus-visible:ring-2 peer-focus-visible:ring-ink";

export function ColourPicker({ value, onChange }: { value: Colour | null; onChange: (colour: Colour | null) => void }) {
  return (
    <fieldset>
      <legend className="mb-1 text-sm font-medium">Identity colour</legend>
      <p className="mb-3 text-sm text-ink-muted">Shown as the ring around your photo and the dot beside your name. Automatic picks one for you.</p>
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2">
          <input type="radio" name="colour" className="peer sr-only" checked={value === null} onChange={() => onChange(null)} />
          <span className={cn(swatch, "border-2 border-dashed border-rail", value === null && "ring-2 ring-ink")} title="Automatic">
            <span className="size-5 rounded-full" style={{ background: AUTOMATIC }} />
          </span>
          <span className="text-sm">Automatic</span>
        </label>
        {SWATCHES.map(({ name, colour }) => (
          <label key={name} title={name}>
            <input
              type="radio"
              name="colour"
              className="peer sr-only"
              checked={value === colour}
              onChange={() => onChange(colour)}
              aria-label={name}
            />
            <span className={cn(swatch, value === colour && "ring-2 ring-ink")} style={{ backgroundColor: colourVar(colour) }} />
          </label>
        ))}
      </div>
    </fieldset>
  );
}
