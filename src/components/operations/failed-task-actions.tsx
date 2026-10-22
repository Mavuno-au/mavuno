"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { settleFailedTasks } from "@/app/actions/operations";
import { Button } from "@/components/ui/button";

export function FailedTaskActions() {
  const [pending, startTransition] = useTransition();

  function settle(retry: boolean) {
    startTransition(async () => {
      const result = await settleFailedTasks(retry);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      const tasks = result.data === 1 ? "1 task" : `${result.data} tasks`;
      toast(retry ? `${tasks} will run again within two minutes` : `${tasks} dismissed`);
    });
  }

  return (
    <div className="mt-2 flex flex-wrap gap-2">
      <Button size="sm" variant="outline" disabled={pending} onClick={() => settle(true)}>
        Try them again
      </Button>
      <Button size="sm" variant="ghost" disabled={pending} onClick={() => settle(false)}>
        Dismiss
      </Button>
    </div>
  );
}
