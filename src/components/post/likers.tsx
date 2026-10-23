"use client";

import { Heart } from "lucide-react";
import { useState, useTransition, type MouseEvent } from "react";
import { loadPostLikers } from "@/app/actions/posts";
import { PersonRow } from "@/components/people/person-row";
import { Dialog } from "@/components/ui/dialog";
import type { PersonSummary } from "@/lib/domain";
import { compact } from "@/lib/format";
import { reach } from "@/lib/version";

type State = { kind: "closed" } | { kind: "loading"; people: PersonSummary[] } | { kind: "open"; people: PersonSummary[]; next: string | null } | { kind: "failed"; error: string };

// An author's own like count opens who liked the post. Nobody else can see
// this list, so it is never a measure of anyone in public.
export function LikeCount({ postId, likes }: { postId: string; likes: number }) {
  const [state, setState] = useState<State>({ kind: "closed" });
  const [, startTransition] = useTransition();

  function load(people: PersonSummary[], before: string | null) {
    setState({ kind: "loading", people });
    startTransition(async () => {
      const result = await reach(loadPostLikers(postId, before));
      setState(result.ok ? { kind: "open", people: [...people, ...result.data.people], next: result.data.next } : { kind: "failed", error: result.error });
    });
  }

  function open(event: MouseEvent) {
    event.stopPropagation();
    load([], null);
  }

  const people = state.kind === "open" || state.kind === "loading" ? state.people : [];

  return (
    <>
      <button
        type="button"
        onClick={open}
        aria-label={`See who liked this (${likes})`}
        title="See who liked this"
        className="flex h-8 min-w-8 items-center gap-1.5 rounded-md px-2 font-mono text-[13px] tabular transition-colors hover:bg-wash hover:text-ink [&_svg]:size-4"
      >
        <Heart /> {compact(likes)}
      </button>
      <Dialog open={state.kind !== "closed"} onClose={() => setState({ kind: "closed" })} title="Liked by">
        <p className="mb-2 text-sm text-ink-muted">Only you can see this.</p>
        {state.kind === "failed" ? <p className="py-4 text-sm text-destructive">{state.error}</p> : null}
        {people.map((person) => (
          <PersonRow key={person.id} person={person} compact />
        ))}
        {state.kind === "loading" ? <p className="py-3 text-sm text-ink-muted">Loading…</p> : null}
        {state.kind === "open" && people.length === 0 ? <p className="py-3 text-sm text-ink-muted">No one you can see has liked this yet.</p> : null}
        {state.kind === "open" && state.next ? (
          <button type="button" className="mt-2 text-sm font-medium text-primary hover:underline" onClick={() => load(people, state.next)}>
            Show more
          </button>
        ) : null}
      </Dialog>
    </>
  );
}
