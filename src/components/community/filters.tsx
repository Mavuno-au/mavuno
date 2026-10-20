"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { ReactNode } from "react";
import { Select } from "@/components/ui/field";
import { cn } from "@/lib/cn";

function useSetParam() {
  const router = useRouter();
  const path = usePathname();
  const params = useSearchParams();
  return (name: string, value: string | null) => {
    const next = new URLSearchParams(params);
    if (value) next.set(name, value);
    else next.delete(name);
    const query = next.toString();
    router.push(query ? `${path}?${query}` : path, { scroll: false });
  };
}

export type FilterOption = { value: string; label: string };

export function FilterSelect({ name, label, value, options, className }: { name: string; label: string; value: string; options: FilterOption[]; className?: string }) {
  const setParam = useSetParam();
  return (
    <label className={cn("min-w-0 flex-1", className)}>
      <span className="sr-only">{label}</span>
      <Select value={value} onChange={(event) => setParam(name, event.target.value || null)} className="h-9 text-sm">
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </Select>
    </label>
  );
}

export function FilterToggle({ name, label, on }: { name: string; label: string; on: boolean }) {
  const setParam = useSetParam();
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={() => setParam(name, on ? null : "1")}
      className={cn(
        "h-9 shrink-0 rounded-md border px-3 text-sm font-medium transition-colors",
        on ? "border-primary bg-primary-soft text-primary" : "border-rail text-ink-muted hover:bg-wash hover:text-ink",
      )}
    >
      {label}
    </button>
  );
}

export function FilterBar({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-center gap-2 border-b border-hairline px-4 py-3 sm:px-6">{children}</div>;
}
