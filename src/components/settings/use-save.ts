"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import type { Result } from "@/lib/result";

export function useSave() {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function save(action: () => Promise<Result<unknown>>, success?: string, after?: () => void) {
    startTransition(async () => {
      const result = await action();
      setError(result.ok ? null : result.error);
      if (!result.ok) return;
      if (success) toast.success(success);
      after?.();
    });
  }

  return { pending, error, save };
}
