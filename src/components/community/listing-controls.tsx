"use client";

import { Pencil, Share2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { cancelEvent } from "@/app/actions/events";
import { closeOpportunity } from "@/app/actions/opportunities";
import { ReportButton } from "@/components/community/report-button";
import { ShareDialog, type Shared } from "@/components/community/share-dialog";
import { Button, ButtonLink } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { useActsAs } from "@/components/shell/viewer-context";
import { reach } from "@/lib/version";

const LISTINGS = {
  event: {
    path: "/events",
    end: "Cancel event",
    confirm: "Cancel this event?",
    explain: "The event stays visible, marked as cancelled, and nobody can RSVP any more. This can't be undone.",
    ended: "Event cancelled",
    run: cancelEvent,
    shared: (id: string): Shared => ({ eventId: id }),
  },
  opportunity: {
    path: "/opportunities",
    end: "Close",
    confirm: "Close this opportunity?",
    explain: "It leaves the opportunities list and the apply buttons are hidden. This can't be undone.",
    ended: "Closed",
    run: closeOpportunity,
    shared: (id: string): Shared => ({ opportunityId: id }),
  },
} as const;

export type ListingKind = keyof typeof LISTINGS;

// Hosts and posters (or anyone running their organisation) manage the listing;
// everyone else can report it once it is public.
export function ListingControls({ kind, id, ownerId, published, ended }: { kind: ListingKind; id: string; ownerId: string; published: boolean; ended: boolean }) {
  const listing = LISTINGS[kind];
  const router = useRouter();
  const owns = useActsAs(ownerId);
  const [dialog, setDialog] = useState<"share" | "end" | null>(null);
  const [pending, startTransition] = useTransition();

  if (!owns) return published ? <ReportButton target={{ targetType: kind, targetId: id }} what={kind} /> : null;

  function end() {
    startTransition(async () => {
      const result = await reach(listing.run(id));
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setDialog(null);
      toast(listing.ended);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap gap-2">
      <ButtonLink href={`${listing.path}/${id}/edit`} size="sm" variant="outline">
        <Pencil /> Edit
      </ButtonLink>
      {published && !ended ? (
        <Button size="sm" variant="outline" onClick={() => setDialog("share")}>
          <Share2 /> Share
        </Button>
      ) : null}
      {!ended ? (
        <Button size="sm" variant="ghost" onClick={() => setDialog("end")} className="text-destructive hover:text-destructive">
          {listing.end}
        </Button>
      ) : null}
      <ShareDialog shared={listing.shared(id)} open={dialog === "share"} onClose={() => setDialog(null)} />
      <Dialog
        open={dialog === "end"}
        onClose={() => setDialog(null)}
        title={listing.confirm}
        footer={
          <>
            <Button variant="ghost" onClick={() => setDialog(null)}>
              Keep it
            </Button>
            <Button variant="destructive" onClick={end} disabled={pending} className="min-w-28">
              {pending ? "Saving…" : listing.end}
            </Button>
          </>
        }
      >
        <p className="text-[15px] text-ink-muted">{listing.explain}</p>
      </Dialog>
    </div>
  );
}
