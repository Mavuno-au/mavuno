"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { loadMoreThread } from "@/app/actions/posts";
import { PostItem } from "@/components/post/post-item";
import type { PostRow, ThreadPlace } from "@/lib/domain";
import { THREAD_MAX_LENGTH } from "@/lib/feeds";
import { reach } from "@/lib/version";

// The posts an author added to their own post by replying to themselves, read
// in order under it. `place` is the place of the post they continue.
export function ThreadContinuation({ postId, place, initial }: { postId: string; place: ThreadPlace; initial: PostRow[] }) {
  const [parts, setParts] = useState(initial);
  const [seed, setSeed] = useState(initial);
  const [pending, startTransition] = useTransition();

  if (seed !== initial) {
    setSeed(initial);
    setParts(initial);
  }

  const last = parts.at(-1);
  const hasMore = last?.kind === "post" && last.continuation > 0 && parts.length < THREAD_MAX_LENGTH;

  function loadMore(lastId: string) {
    startTransition(async () => {
      const result = await reach(loadMoreThread(lastId));
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setParts((current) => [...current, ...result.data.filter((part) => !current.some((row) => row.id === part.id))]);
    });
  }

  return (
    <div>
      {parts.map((row, index) => (
        <PostItem key={row.id} row={row} thread={{ parentId: parts[index - 1]?.id ?? postId, depth: 0 }} place={{ ...place, position: place.position + index + 1 }} />
      ))}
      {hasMore ? (
        <button
          type="button"
          disabled={pending}
          onClick={() => loadMore(last.id)}
          className="w-full border-b border-hairline px-6 py-3 text-sm font-medium text-primary hover:bg-wash disabled:opacity-60"
        >
          {pending ? "Loading…" : "Show more of this thread"}
        </button>
      ) : null}
    </div>
  );
}
