"use client";

import { Composer } from "@/components/post/composer";
import { Dialog } from "@/components/ui/dialog";

export type Shared = { eventId: string } | { opportunityId: string };

export function ShareDialog({ shared, open, onClose }: { shared: Shared; open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onClose={onClose} title="Share to your followers">
      <Composer mode={{ kind: "post", ...shared, placeholder: "Say a few words about it" }} autoFocus onPosted={onClose} />
    </Dialog>
  );
}
