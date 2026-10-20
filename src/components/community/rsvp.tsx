"use client";

import { Check, Star } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { setRsvp } from "@/app/actions/events";
import { useSignedIn } from "@/components/community/use-signed-in";
import { Button } from "@/components/ui/button";
import type { RsvpStatus } from "@/lib/data/community";

const CONFIRMATIONS: Record<RsvpStatus | "none", string> = {
  going: "You're going",
  interested: "Marked as interested",
  none: "RSVP withdrawn",
};

export function RsvpButtons({ eventId, mine: initial, going, capacity }: { eventId: string; mine: RsvpStatus | null; going: number; capacity: number | null }) {
  const router = useRouter();
  const signedIn = useSignedIn();
  const [mine, setMine] = useState(initial);
  const [pending, startTransition] = useTransition();
  const full = capacity !== null && going >= capacity && initial !== "going";

  function choose(status: RsvpStatus | null) {
    const previous = mine;
    setMine(status);
    startTransition(async () => {
      const result = await setRsvp(eventId, status);
      if (!result.ok) {
        setMine(previous);
        toast.error(result.error);
        return;
      }
      toast(CONFIRMATIONS[status ?? "none"]);
      router.refresh();
    });
  }

  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant={mine === "going" ? "primary" : "outline"}
          aria-pressed={mine === "going"}
          disabled={pending || full}
          onClick={() => signedIn(() => choose(mine === "going" ? null : "going"))}
          className="min-w-32"
        >
          <Check /> {full ? "Full" : mine === "going" ? "You're going" : "Going"}
        </Button>
        <Button
          variant={mine === "interested" ? "primary" : "outline"}
          aria-pressed={mine === "interested"}
          disabled={pending}
          onClick={() => signedIn(() => choose(mine === "interested" ? null : "interested"))}
          className="min-w-32"
        >
          <Star /> Interested
        </Button>
        {mine ? (
          <Button variant="ghost" disabled={pending} onClick={() => choose(null)}>
            Can't make it
          </Button>
        ) : null}
      </div>
      {capacity !== null ? (
        <p className="font-mono text-xs text-ink-muted">
          {Math.min(going, capacity)} of {capacity} places taken
        </p>
      ) : null}
    </div>
  );
}
