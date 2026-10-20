"use client";

import { Check, X } from "lucide-react";
import { useEffect, useId, useState, useTransition } from "react";
import { toast } from "sonner";
import { searchPeople } from "@/app/actions/messages";
import { Avatar } from "@/components/ui/avatar";
import { Input } from "@/components/ui/field";
import type { PersonSummary } from "@/lib/domain";
import { cn } from "@/lib/cn";

export function PeoplePicker({ selected, onChange, exclude = [], autoFocus }: { selected: PersonSummary[]; onChange: (people: PersonSummary[]) => void; exclude?: string[]; autoFocus?: boolean }) {
  const inputId = useId();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<{ query: string; people: PersonSummary[] }>({ query: "", people: [] });
  const [pending, startTransition] = useTransition();
  const trimmed = query.trim();

  useEffect(() => {
    if (!trimmed) return;
    const timer = setTimeout(
      () =>
        startTransition(async () => {
          try {
            setResults({ query: trimmed, people: await searchPeople(trimmed) });
          } catch {
            toast.error("Couldn't reach Mavuno. Check your connection and try again.");
          }
        }),
      250,
    );
    return () => clearTimeout(timer);
  }, [trimmed]);

  const shown = trimmed && results.query === trimmed ? results.people.filter((person) => !exclude.includes(person.id)) : [];
  const isSelected = (person: PersonSummary) => selected.some((item) => item.id === person.id);

  function toggle(person: PersonSummary) {
    onChange(isSelected(person) ? selected.filter((item) => item.id !== person.id) : [...selected, person]);
  }

  return (
    <div className="grid gap-2">
      <label htmlFor={inputId} className="sr-only">
        Search people
      </label>
      {selected.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5" aria-label="Chosen people">
          {selected.map((person) => (
            <li key={person.id}>
              <button type="button" onClick={() => toggle(person)} aria-label={`Remove ${person.displayName}`} className="flex items-center gap-1.5 rounded-full bg-primary-soft py-0.5 pr-2 pl-0.5 text-sm text-primary hover:opacity-80">
                <Avatar person={person} size="xs" />
                {person.displayName}
                <X className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <Input id={inputId} type="search" value={query} autoFocus={autoFocus} autoComplete="off" placeholder="Search by name or @username" onChange={(event) => setQuery(event.target.value)} />
      {trimmed ? (
        <ul className={cn("grid", pending && "opacity-60")} aria-live="polite">
          {shown.map((person) => {
            const chosen = isSelected(person);
            return (
              <li key={person.id}>
                <button type="button" onClick={() => toggle(person)} aria-pressed={chosen} className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left hover:bg-wash">
                  <Avatar person={person} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-medium">{person.displayName}</span>
                    <span className="block truncate font-mono text-xs text-ink-muted">@{person.username}</span>
                  </span>
                  <span className={cn("flex size-5 items-center justify-center rounded-full border", chosen ? "border-primary bg-primary text-primary-ink" : "border-rail")}>
                    {chosen ? <Check className="size-3.5" /> : null}
                  </span>
                </button>
              </li>
            );
          })}
          {!pending && results.query === trimmed && shown.length === 0 ? <li className="px-2 py-3 text-sm text-ink-muted">No one found. Try another name.</li> : null}
        </ul>
      ) : null}
    </div>
  );
}
