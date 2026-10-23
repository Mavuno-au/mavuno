"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { setMembership } from "@/app/actions/spaces";
import { useSignedIn } from "@/components/community/use-signed-in";
import { Button } from "@/components/ui/button";
import { reach } from "@/lib/version";

export function JoinButton({ spaceId, joined: initial }: { spaceId: string; joined: boolean }) {
  const router = useRouter();
  const signedIn = useSignedIn();
  const [joined, setJoined] = useState(initial);
  const [pending, startTransition] = useTransition();

  function toggle() {
    const next = !joined;
    setJoined(next);
    startTransition(async () => {
      const result = await reach(setMembership(spaceId, next));
      if (!result.ok) {
        setJoined(!next);
        toast.error(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <Button size="sm" variant={joined ? "outline" : "primary"} disabled={pending} onClick={() => signedIn(toggle)} className="min-w-20">
      {joined ? "Leave" : "Join"}
    </Button>
  );
}
