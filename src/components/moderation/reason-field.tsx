"use client";

import { useId } from "react";
import { Textarea } from "@/components/ui/field";

export const REASON_LIMIT = 280;

export function ReasonField({ value, onChange, disabled }: { value: string; onChange: (value: string) => void; disabled: boolean }) {
  const id = useId();
  return (
    <div className="mt-3 grid gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        Reason (optional)
      </label>
      <Textarea id={id} value={value} maxLength={REASON_LIMIT} disabled={disabled} autoFocus onChange={(event) => onChange(event.target.value)} className="min-h-20" />
      <p className="flex justify-between gap-3 text-sm text-ink-muted">
        <span>Only the author sees this. They're never told who moderated.</span>
        <span className="font-mono text-xs tabular">{REASON_LIMIT - value.length}</span>
      </p>
    </div>
  );
}
