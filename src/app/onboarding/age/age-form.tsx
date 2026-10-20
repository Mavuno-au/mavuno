"use client";

import { useActionState } from "react";
import { confirmAge } from "@/app/actions/age";
import { BirthDateFields } from "@/components/age/birth-date-fields";
import { Button } from "@/components/ui/button";
import { FormError } from "@/components/ui/field";

export function AgeForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState(confirmAge, null);
  return (
    <form action={action} className="grid gap-4">
      <input type="hidden" name="next" value={next} />
      <BirthDateFields autoFocus />
      <FormError message={state?.ok === false ? state.error : null} />
      <div>
        <Button type="submit" disabled={pending} className="min-w-28">
          {pending ? "Checking…" : "Continue"}
        </Button>
      </div>
    </form>
  );
}
