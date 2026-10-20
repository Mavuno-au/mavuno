"use client";

import { useActionState, type ReactNode } from "react";
import { checkAge } from "@/app/actions/age";
import { BirthDateFields, Under16Support } from "@/components/age/birth-date-fields";
import { Button } from "@/components/ui/button";
import { FormError } from "@/components/ui/field";

export type SignUpStart = "age" | "methods" | "under_16";

// The age question comes before both ways of joining, because a Google
// account is created the moment Google sends the person back.
export function SignUpSteps({ start, children }: { start: SignUpStart; children: ReactNode }) {
  const [state, action, pending] = useActionState(checkAge, null);
  const step: SignUpStart = state?.ok ? (state.data.kind === "old_enough" ? "methods" : "under_16") : start;

  switch (step) {
    case "methods":
      return children;
    case "under_16":
      return (
        <div className="grid gap-4 text-[15px]">
          <p className="font-medium">Mavuno is for people 16 and older.</p>
          <p className="text-ink-muted">
            Australian law doesn't allow social media accounts for people under 16, so we can't create one for you. We haven't kept your date of birth. You're welcome to join
            when you turn 16.
          </p>
          <Under16Support />
        </div>
      );
    case "age":
      return (
        <form action={action} className="grid gap-4">
          <BirthDateFields autoFocus />
          <FormError message={state?.ok === false ? state.error : null} />
          <Button type="submit" size="lg" disabled={pending}>
            {pending ? "Checking…" : "Continue"}
          </Button>
        </form>
      );
    default: {
      const exhaustive: never = step;
      return exhaustive;
    }
  }
}
