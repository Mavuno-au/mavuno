"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { setRelation } from "@/app/actions/social";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";

export function ConfirmBlockDialog({
  profile,
  open,
  onClose,
  onBlocked,
}: {
  profile: { id: string; username: string; displayName: string };
  open: boolean;
  onClose: () => void;
  onBlocked: () => void;
}) {
  const [pending, startTransition] = useTransition();

  function block() {
    startTransition(async () => {
      const result = await setRelation("block", profile.id, true);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast(`Blocked @${profile.username}`);
      onClose();
      onBlocked();
    });
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`Block @${profile.username}?`}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="destructive" className="min-w-20" disabled={pending} onClick={block}>
            Block
          </Button>
        </>
      }
    >
      <div className="grid gap-3 text-[15px] text-ink-muted">
        <p>
          You and {profile.displayName} will stop following each other. Unblocking later won't bring those follows back.
        </p>
        <p>Neither of you will be able to message, follow or reply to the other, and you won't see each other's posts.</p>
        <p>They won't be told. You can unblock them any time in Settings, under Safety.</p>
      </div>
    </Dialog>
  );
}
