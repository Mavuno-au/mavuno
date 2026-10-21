"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { PersonRow } from "@/components/people/person-row";
import { Button } from "@/components/ui/button";
import type { ConnectionsPage, Direction } from "@/lib/data/profiles";
import { moreConnections } from "./actions";

export function ConnectionList({ profileId, direction, initial }: { profileId: string; direction: Direction; initial: ConnectionsPage }) {
  const [people, setPeople] = useState(initial.people);
  const [next, setNext] = useState(initial.next);
  const [pending, startTransition] = useTransition();

  function showMore() {
    if (!next) return;
    startTransition(async () => {
      const result = await moreConnections({ profileId, direction, cursor: next }).catch(() => null);
      if (!result?.ok) {
        toast.error(result?.error ?? "Couldn't load more. Try again.");
        return;
      }
      setPeople((current) => [...current, ...result.data.people.filter((person) => !current.some((shown) => shown.id === person.id))]);
      setNext(result.data.next);
    });
  }

  return (
    <>
      {people.map((person) => (
        <PersonRow key={person.id} person={person} />
      ))}
      {next ? (
        <div className="flex justify-center px-4 py-6">
          <Button variant="outline" className="min-w-32" disabled={pending} onClick={showMore}>
            {pending ? "Loading…" : "Show more"}
          </Button>
        </div>
      ) : null}
    </>
  );
}
