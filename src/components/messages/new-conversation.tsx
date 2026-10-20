"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createGroup, startConversation } from "@/app/actions/messages";
import { PeoplePicker } from "@/components/messages/people-picker";
import { Button } from "@/components/ui/button";
import { Field, FormError, Input } from "@/components/ui/field";
import type { PersonSummary } from "@/lib/domain";

export function NewConversation() {
  const router = useRouter();
  const [people, setPeople] = useState<PersonSummary[]>([]);
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [only] = people;
  const group = people.length > 1;

  function start() {
    if (!only) return;
    setError(null);
    startTransition(async () => {
      try {
        const result = group ? await createGroup({ title, memberIds: people.map((person) => person.id) }) : await startConversation(only.id);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        router.push(`/messages/${result.data.id}`);
      } catch {
        setError("Couldn't reach Mavuno. Check your connection and try again.");
      }
    });
  }

  return (
    <form
      className="grid gap-4 px-4 py-4 sm:px-6"
      onSubmit={(event) => {
        event.preventDefault();
        start();
      }}
    >
      <p className="text-[15px] text-ink-muted">Choose one person for a private chat, or a few people to start a group. People who don't follow you get your first message as a request.</p>
      <PeoplePicker selected={people} onChange={setPeople} autoFocus />
      {group ? (
        <Field label="Group name" hint="Optional. Everyone in the group can see it." htmlFor="group-title">
          <Input id="group-title" value={title} maxLength={60} placeholder="Melbourne mentors" onChange={(event) => setTitle(event.target.value)} />
        </Field>
      ) : null}
      <div className="flex items-center justify-between gap-3">
        <FormError message={error} />
        <Button type="submit" disabled={!only || pending} className="min-w-28">
          {pending ? "Starting…" : group ? "Start group" : "Start chat"}
        </Button>
      </div>
    </form>
  );
}
