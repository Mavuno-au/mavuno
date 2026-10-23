"use client";

import { Check } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { votePoll } from "@/app/actions/posts";
import { useViewer } from "@/components/shell/viewer-context";
import { cn } from "@/lib/cn";
import type { Poll } from "@/lib/domain";
import { count, pollTimeLeft } from "@/lib/format";
import { joinPath } from "@/lib/safe-redirect";
import { reach } from "@/lib/version";

export function PollView({ postId, poll: initial, own }: { postId: string; poll: Poll; own: boolean }) {
  const viewer = useViewer();
  const router = useRouter();
  const pathname = usePathname();
  const [poll, setPoll] = useState(initial);
  const [pending, startTransition] = useTransition();
  const closed = poll.closesAt !== null && new Date(poll.closesAt) < new Date();
  const canVote = !own && !closed && poll.myVote === null && poll.closesAt !== null;

  function vote(optionId: string) {
    if (!viewer) return router.push(joinPath(pathname));
    startTransition(async () => {
      const result = await reach(votePoll(postId, optionId));
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setPoll((current) => ({
        ...current,
        myVote: optionId,
        showResults: true,
        votes: current.votes + 1,
        options: current.options.map((o) => ({ ...o, votes: (o.votes ?? 0) + (o.id === optionId ? 1 : 0) })),
      }));
    });
  }

  return (
    <div className="mt-3 grid gap-2" onClick={(event) => event.stopPropagation()}>
      {poll.options.map((option) => {
        const share = poll.showResults && poll.votes > 0 ? Math.round(((option.votes ?? 0) / poll.votes) * 100) : 0;
        const mine = poll.myVote === option.id;
        if (canVote) {
          return (
            <button
              key={option.id}
              type="button"
              disabled={pending}
              onClick={() => vote(option.id)}
              className="h-10 rounded-md border border-primary/60 px-3 text-left text-[15px] font-medium text-primary hover:bg-primary-soft disabled:opacity-60"
            >
              <bdi>{option.label}</bdi>
            </button>
          );
        }
        return (
          <div key={option.id} className="relative flex h-10 items-center justify-between overflow-hidden rounded-md bg-wash px-3 text-[15px]">
            <span className={cn("absolute inset-y-0 left-0 bg-primary-soft transition-[width]", mine && "bg-primary/25")} style={{ width: `${share}%` }} />
            <span className="relative flex items-center gap-1.5 font-medium">
              <bdi>{option.label}</bdi>
              {mine ? <Check className="size-4 text-primary" aria-label="Your vote" /> : null}
            </span>
            {poll.showResults ? <span className="relative font-mono text-[13px] tabular">{share}%</span> : null}
          </div>
        );
      })}
      <p className="font-mono text-xs text-ink-muted">
        {count(poll.votes, "vote")} · {pollTimeLeft(poll.closesAt)}
        {!poll.showResults && !canVote && viewer ? " · results show when it closes" : ""}
        {!viewer && canVote ? " · sign in to vote" : ""}
      </p>
    </div>
  );
}
