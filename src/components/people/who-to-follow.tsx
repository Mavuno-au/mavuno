"use client";

import { EyeOff, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useId, useState, useTransition } from "react";
import { toast } from "sonner";
import { dismissSuggestion, loadSuggestionPage } from "@/app/actions/shell";
import { PersonRow } from "@/components/people/person-row";
import { Button } from "@/components/ui/button";
import { Menu } from "@/components/ui/menu";
import { cn } from "@/lib/cn";
import type { PersonSummary } from "@/lib/domain";
import { rememberHidden, rememberRound } from "@/lib/who-to-follow";

export type WhoToFollowPage = { people: PersonSummary[]; spares: PersonSummary[]; pages: number; round: number; day: string };

// Hiding only writes the cookie, so the block stays in place with an Undo
// until the next page load leaves it out. "Not for me" takes the person out
// at once and a spare from a later page fills the gap.
export function WhoToFollow({ initial, className }: { initial: WhoToFollowPage; className?: string }) {
  const [people, setPeople] = useState(initial.people);
  const [spares, setSpares] = useState(initial.spares);
  const [round, setRound] = useState(initial.round);
  const [hidden, setHidden] = useState(false);
  const [refreshing, startRefresh] = useTransition();
  const headingId = useId();

  function refresh() {
    if (refreshing) return;
    const next = round + 1;
    startRefresh(async () => {
      const result = await loadSuggestionPage(next);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      rememberRound(initial.day, next);
      setRound(next);
      setPeople(result.data.people);
      setSpares(result.data.spares);
    });
  }

  function hide(value: boolean) {
    rememberHidden(value);
    setHidden(value);
  }

  function dismiss(person: PersonSummary) {
    const [spare, ...rest] = spares;
    const index = people.indexOf(person);
    setPeople((current) => current.flatMap((shown) => (shown.id === person.id ? (spare ? [spare] : []) : [shown])));
    setSpares(rest);
    dismissSuggestion(person.id, true).then((result) => {
      if (!result.ok) {
        toast.error(result.error);
        setPeople((current) => current.toSpliced(Math.max(0, index), 0, person));
        return;
      }
      toast("We won't suggest them again", {
        action: {
          label: "Undo",
          onClick: () =>
            dismissSuggestion(person.id, false).then((undone) => {
              if (!undone.ok) return toast.error(undone.error);
              setPeople((current) => (current.some((shown) => shown.id === person.id) ? current : [person, ...current]));
            }),
        },
      });
    });
  }

  return (
    <section aria-labelledby={headingId} className={className}>
      <div className="flex min-h-8 items-center justify-between gap-2">
        <h2 id={headingId} className="text-sm font-semibold">Who to follow</h2>
        {hidden ? null : (
          <div className="flex items-center">
            {initial.pages > 1 ? (
              <button
                type="button"
                onClick={refresh}
                aria-disabled={refreshing}
                aria-label="Suggest other people"
                title="Suggest other people"
                className="rounded-md p-1.5 text-ink-muted hover:bg-wash hover:text-ink"
              >
                <RefreshCw className={cn("size-4", refreshing && "animate-spin motion-reduce:animate-none")} />
              </button>
            ) : null}
            <Menu label="Who to follow options" items={[{ kind: "action", label: "Hide Who to follow", icon: <EyeOff />, onSelect: () => hide(true) }]} />
          </div>
        )}
      </div>
      {hidden ? (
        <div className="mt-1 flex items-center justify-between gap-3">
          <p className="min-w-0 text-sm text-ink-muted">
            Hidden. Bring it back in <Link href="/settings/appearance" className="text-primary hover:underline">Settings</Link>.
          </p>
          <Button variant="outline" size="sm" onClick={() => hide(false)}>Undo</Button>
        </div>
      ) : (
        <>
          <div aria-busy={refreshing}>
            {people.length === 0 ? (
              <p className="py-2 text-sm text-ink-muted">No one else to suggest today.</p>
            ) : (
              people.map((person) => (
                <PersonRow key={person.id} person={person} detail={person.reason} compact card onDismiss={() => dismiss(person)} />
              ))
            )}
          </div>
          <Link href="/discover/people" className="mt-1 inline-block text-sm text-primary hover:underline">See more people</Link>
        </>
      )}
    </section>
  );
}
