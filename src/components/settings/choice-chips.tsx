"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/cn";

export type Choice<T extends string> = { value: T; label: string };

export function ChoiceChips<T extends string>({
  label,
  choices,
  selected,
  onChange,
  max,
}: {
  label: string;
  choices: readonly Choice<T>[];
  selected: readonly T[];
  onChange: (next: T[]) => void;
  max?: number;
}) {
  const full = max !== undefined && selected.length >= max;
  return (
    <fieldset className="grid gap-2">
      <legend className="mb-2 flex w-full items-baseline justify-between gap-3 text-sm font-medium">
        {label}
        {max ? <span className="font-mono text-xs font-normal text-ink-muted tabular">{selected.length}/{max}</span> : null}
      </legend>
      <div className="flex flex-wrap gap-2">
        {choices.map((choice) => {
          const on = selected.includes(choice.value);
          return (
            <button
              key={choice.value}
              type="button"
              aria-pressed={on}
              disabled={!on && full}
              onClick={() => onChange(on ? selected.filter((value) => value !== choice.value) : [...selected, choice.value])}
              className={cn(
                "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-sm transition-colors disabled:opacity-40 [&_svg]:size-3.5",
                on ? "border-primary bg-primary-soft text-primary" : "border-rail text-ink hover:bg-wash",
              )}
            >
              {on ? <Check aria-hidden /> : null}
              {choice.label}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
