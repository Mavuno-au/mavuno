"use client";

import { useEffect, useState, type KeyboardEvent, type RefObject } from "react";
import { z } from "zod";
import { Avatar } from "@/components/ui/avatar";
import { cn } from "@/lib/cn";
import { parsePeople, type PersonSummary, type ProfileCard } from "@/lib/domain";
import { getBrowserClient } from "@/lib/supabase/browser";

type Query = { text: string; start: number };
type Person = Pick<PersonSummary, "id" | "username" | "displayName" | "avatarUrl" | "colour">;

const AT_CARET = /(?:^|[^A-Za-z0-9_.@/])@([A-Za-z0-9_]{0,30})$/;
const LIMIT = 6;

const PERSON = "id, username, display_name, avatar_url, colour:effective_colour, bio, headline, account_type, org_verified, followers_count";

// A bare @ suggests people the writer follows; typing searches everyone.
async function suggest(text: string, viewerId: string): Promise<Person[]> {
  const supabase = getBrowserClient();
  if (text) {
    const { data } = await supabase.rpc("search_profiles", { p_query: text, p_limit: LIMIT + 1 });
    return parsePeople(data);
  }
  const { data } = await supabase
    .from("follows")
    .select(`person:profiles!follows_followee_id_fkey(${PERSON})`)
    .eq("follower_id", viewerId)
    .order("created_at", { ascending: false })
    .limit(LIMIT);
  return parsePeople(z.array(z.object({ person: z.unknown() })).parse(data ?? []).map((row) => row.person));
}

// People in the conversation (the post being replied to or quoted) come first
// when they match; the writer is never suggested.
function rank(found: Person[], priority: ProfileCard[], text: string, viewerId: string) {
  const matches = (person: Person) => !text || person.username.startsWith(text.toLowerCase()) || person.displayName.toLowerCase().includes(text.toLowerCase());
  const first = priority.filter(matches);
  return [...first, ...found.filter((person) => !first.some((p) => p.id === person.id))].filter((person) => person.id !== viewerId).slice(0, LIMIT);
}

export function useMentions({
  textarea,
  body,
  setBody,
  viewerId,
  priority,
}: {
  textarea: RefObject<HTMLTextAreaElement | null>;
  body: string;
  setBody: (body: string) => void;
  viewerId: string | null;
  priority: ProfileCard[];
}) {
  const [query, setQuery] = useState<Query | null>(null);
  const [found, setFound] = useState<{ text: string; people: Person[] }>({ text: "", people: [] });
  const [active, setActive] = useState(0);
  const text = query?.text ?? null;
  const results = query && viewerId && found.text === query.text ? rank(found.people, priority, query.text, viewerId) : [];

  useEffect(() => {
    if (text === null || !viewerId) return;
    const timer = setTimeout(async () => {
      setFound({ text, people: await suggest(text, viewerId) });
      setActive(0);
    }, text ? 150 : 0);
    return () => clearTimeout(timer);
  }, [text, viewerId]);

  function onSelect() {
    const element = textarea.current;
    if (!element) return;
    const match = body.slice(0, element.selectionStart).match(AT_CARET);
    setQuery(match?.[1] !== undefined ? { text: match[1], start: element.selectionStart - match[1].length - 1 } : null);
  }

  function choose(person: Person) {
    const element = textarea.current;
    if (!element || !query) return;
    const end = query.start + query.text.length + 1;
    setBody(`${body.slice(0, query.start)}@${person.username} ${body.slice(end)}`);
    setQuery(null);
    requestAnimationFrame(() => {
      const caret = query.start + person.username.length + 2;
      element.setSelectionRange(caret, caret);
      element.focus();
    });
  }

  function handleKey(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (results.length === 0) return false;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setActive((index) => (index + (event.key === "ArrowDown" ? 1 : results.length - 1)) % results.length);
      return true;
    }
    if (event.key === "Enter" || event.key === "Tab") {
      const person = results[active];
      if (!person) return false;
      event.preventDefault();
      choose(person);
      return true;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      setQuery(null);
      return true;
    }
    return false;
  }

  return { open: results.length > 0, results, active, choose, handleKey, onSelect };
}

export function MentionMenu({ state }: { state: ReturnType<typeof useMentions> }) {
  if (!state.open) return null;
  return (
    <ul role="listbox" aria-label="People" className="absolute left-0 z-30 mt-1 w-72 overflow-hidden rounded-lg border border-hairline bg-popover py-1 shadow-lg">
      {state.results.map((person, index) => (
        <li key={person.id} role="option" aria-selected={index === state.active}>
          <button
            type="button"
            onMouseDown={(event) => {
              event.preventDefault();
              state.choose(person);
            }}
            className={cn("flex w-full items-center gap-2.5 px-3 py-2 text-left", index === state.active && "bg-wash")}
          >
            <Avatar person={person} size="sm" />
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold">{person.displayName}</span>
              <span className="block truncate font-mono text-xs text-ink-muted">@{person.username}</span>
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
