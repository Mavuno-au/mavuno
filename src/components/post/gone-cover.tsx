"use client";

import { useState } from "react";
import { postPresence } from "@/app/actions/post-presence";
import { ButtonLink } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { ownDeletionAt, shouldCover, type Presence } from "@/lib/post-presence";
import { usePoll } from "@/lib/use-poll";

const POLL_MS = 30_000;

type Gone = Exclude<Presence, { kind: "present" }>;

// Watches the post a page is about and, once it is deleted or no longer
// visible, covers the page so nothing under it can be acted on. The native
// modal makes the rest of the page inert; the cover offers the only ways out.
export function PostGoneCover({ postId, authorUsername }: { postId: string; authorUsername: string }) {
  const [gone, setGone] = useState<Gone | null>(null);

  usePoll(
    async () => {
      const result = await postPresence(postId);
      if (!result.ok) throw new Error(result.error);
      const presence = result.data;
      if (presence.kind !== "present" && shouldCover(presence, ownDeletionAt(postId), Date.now())) setGone(presence);
    },
    POLL_MS,
    gone === null,
  );

  if (gone === null) return null;
  const deleted = gone.kind === "deleted";
  return (
    <Dialog
      open
      dismissible={false}
      onClose={() => {}}
      title={deleted ? "This post is gone" : "This post isn't available any more"}
      description={deleted ? "It was deleted while you were reading it." : "It may be waiting for review, or you can no longer see posts from this account."}
    >
      <div className="mt-4 flex flex-wrap gap-2">
        <ButtonLink href="/">Back to home</ButtonLink>
        {deleted ? (
          <ButtonLink href={`/@${authorUsername}`} variant="outline">
            See @{authorUsername}
          </ButtonLink>
        ) : null}
      </div>
    </Dialog>
  );
}
