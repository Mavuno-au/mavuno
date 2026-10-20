"use client";

import { useId } from "react";
import { Select } from "@/components/ui/field";
import { BREAKABLE_RULES, breakableRuleSchema, type BreakableRule } from "@/lib/rules";

// The notice tells the author which rule this was, so removing or suspending
// needs one.
export function RuleSelect({ value, onChange, disabled }: { value: BreakableRule | null; onChange: (rule: BreakableRule | null) => void; disabled: boolean }) {
  const id = useId();
  return (
    <span className="inline-flex items-center gap-2">
      <label htmlFor={id} className="text-sm text-ink-muted">
        Rule
      </label>
      <Select
        id={id}
        value={value ?? ""}
        disabled={disabled}
        className="h-8 w-auto max-w-56 text-sm"
        onChange={(event) => onChange(breakableRuleSchema.safeParse(event.target.value).data ?? null)}
      >
        <option value="">Choose the rule it breaks</option>
        {BREAKABLE_RULES.map((rule) => (
          <option key={rule.value} value={rule.value}>
            {rule.label}
          </option>
        ))}
      </Select>
    </span>
  );
}
