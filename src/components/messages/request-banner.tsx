"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { respondToRequest } from "@/app/actions/messages";
import { setRelation } from "@/app/actions/social";
import { ReportDialog } from "@/components/moderation/report-dialog";
import { Button } from "@/components/ui/button";
import type { Conversation, Member } from "@/lib/data/messages";

export function RequestBanner({ conversation, from }: { conversation: Conversation; from: Member | null }) {
  const router = useRouter();
  const [reporting, setReporting] = useState(false);
  const [pending, startTransition] = useTransition();
  const name = from?.displayName ?? "Someone";

  function respond(choice: "accept" | "decline" | "block") {
    startTransition(async () => {
      try {
        if (choice === "block" && from) {
          const blocked = await setRelation("block", from.id, true);
          if (!blocked.ok) {
            toast.error(blocked.error);
            return;
          }
        }
        const result = await respondToRequest(conversation.id, choice === "accept");
        if (!result.ok) {
          toast.error(result.error);
          return;
        }
        if (choice === "accept") return;
        toast(choice === "block" ? `Blocked ${name}` : "Request declined. They won't be told.");
        router.push("/messages/requests");
      } catch {
        toast.error("Couldn't reach Mavuno. Check your connection and try again.");
      }
    });
  }

  return (
    <div className="border-t border-hairline bg-surface px-4 py-4 sm:px-6">
      <p className="font-semibold">{conversation.kind === "group" ? `${name} added you to ${conversation.name}` : `${name} wants to message you`}</p>
      <p className="mt-1 text-sm text-ink-muted">You don't follow them. They won't know you've read this unless you accept, and declining is private.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button onClick={() => respond("accept")} disabled={pending} className="min-w-20">
          Accept
        </Button>
        <Button variant="outline" onClick={() => respond("decline")} disabled={pending} className="min-w-20">
          Decline
        </Button>
        {from ? (
          <>
            <Button variant="ghost" onClick={() => respond("block")} disabled={pending} className="text-destructive hover:text-destructive">
              Block
            </Button>
            <Button variant="ghost" onClick={() => setReporting(true)} disabled={pending}>
              Report
            </Button>
          </>
        ) : null}
      </div>
      <ReportDialog target={reporting && from ? { targetType: "profile", targetId: from.id } : null} onClose={() => setReporting(false)} what="account" />
    </div>
  );
}
