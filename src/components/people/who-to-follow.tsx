"use client";

import { EyeOff, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useId, useState, useTransition } from "react";
import { toast } from "sonner";
import { loadSuggestionPage } from "@/app/actions/shell";
import { PersonRow } from "@/components/people/person-row";
import { Button } from "@/components/ui/button";
import { Menu } from "@/components/ui/menu";
import { cn } from "@/lib/cn";
import type { PersonSummary } from "@/lib/domain";
import { rememberHidden, rememberRound } from "@/lib/who-to-follow";

export type WhoToFollowPage = { people: PersonSummary[]; pages: number; round: number; day: string };

// Hiding only writes the cookie, so the block stays in place with an Undo
// until the next page load leaves it out.
export function WhoToFollow({ initial, className }: { initial: WhoToFollowPage; className?: string }) {
  const [people, setPeople] = useState(initial.people);
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
      setPeople(result.data);
    });
  }

  function hide(value: boolean) {
    rememberHidden(value);
    setHidden(value);
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
            {people.map((person) => (
              <PersonRow key={person.id} person={person} detail={person.reason} compact card />
            ))}
          </div>
          <Link href="/discover/people" className="mt-1 inline-block text-sm text-primary hover:underline">See more people</Link>
        </>
      )}
    </section>
  );
}
