"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { loadMoreReplies } from "@/app/actions/posts";
import { PostItem } from "@/components/post/post-item";
import { EndOfList } from "@/components/ui/page";
import type { PostRow } from "@/lib/domain";

export function ReplyList({ postId, initial, next: initialNext }: { postId: string; initial: PostRow[]; next: string | null }) {
  const [rows, setRows] = useState(initial);
  const [next, setNext] = useState(initialNext);
  const [seed, setSeed] = useState(initial);
  const [pending, startTransition] = useTransition();

  if (seed !== initial) {
    setSeed(initial);
    setRows(initial);
    setNext(initialNext);
  }

  if (rows.length === 0) return <EndOfList>No replies yet.</EndOfList>;

  return (
    <div>
      {rows.map((row) => (
        <PostItem key={row.id} row={row} thread={{ parentId: postId, depth: 0 }} />
      ))}
      {next ? (
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              try {
                const page = await loadMoreReplies(postId, next);
                setRows((current) => [...current, ...page.replies.filter((reply) => !current.some((row) => row.id === reply.id))]);
                setNext(page.next);
              } catch {
                toast.error("Couldn't load more replies. Try again.");
              }
            })
          }
          className="w-full border-b border-hairline px-6 py-3 text-sm font-medium text-primary hover:bg-wash disabled:opacity-60"
        >
          {pending ? "Loading…" : "Show more replies"}
        </button>
      ) : (
        <EndOfList>That's the whole conversation.</EndOfList>
      )}
    </div>
  );
}
