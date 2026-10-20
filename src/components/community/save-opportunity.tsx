"use client";

import { Bookmark } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { setOpportunitySaved } from "@/app/actions/opportunities";
import { useSignedIn } from "@/components/community/use-signed-in";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";

export function SaveOpportunity({ opportunityId, saved: initial }: { opportunityId: string; saved: boolean }) {
  const signedIn = useSignedIn();
  const [saved, setSaved] = useState(initial);
  const [pending, startTransition] = useTransition();

  function toggle() {
    const next = !saved;
    setSaved(next);
    startTransition(async () => {
      const result = await setOpportunitySaved(opportunityId, next);
      if (!result.ok) {
        setSaved(!next);
        toast.error(result.error);
      }
    });
  }

  return (
    <Button variant="outline" aria-pressed={saved} disabled={pending} onClick={() => signedIn(toggle)} className="min-w-24">
      <Bookmark className={cn(saved && "fill-current text-primary")} /> {saved ? "Saved" : "Save"}
    </Button>
  );
}
