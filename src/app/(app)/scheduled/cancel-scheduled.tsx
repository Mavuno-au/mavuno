"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { cancelScheduledPost } from "@/app/actions/posts";
import { Button } from "@/components/ui/button";
import { reach } from "@/lib/version";

export function CancelScheduled({ id, label }: { id: string; label: "Cancel" | "Clear" }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={pending}
      className="min-w-20"
      onClick={() =>
        startTransition(async () => {
          const result = await reach(cancelScheduledPost(id));
          if (result.ok) toast(label === "Cancel" ? "Scheduled post cancelled" : "Cleared");
          else toast.error(result.error);
          router.refresh();
        })
      }
    >
      {pending ? `${label === "Cancel" ? "Cancelling" : "Clearing"}…` : label}
    </Button>
  );
}
