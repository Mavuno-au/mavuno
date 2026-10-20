"use client";

import { useEffect, useState, type KeyboardEvent, type RefObject } from "react";
import { Avatar } from "@/components/ui/avatar";
import { cn } from "@/lib/cn";
import { parsePeople, type PersonSummary } from "@/lib/domain";
import { getBrowserClient } from "@/lib/supabase/browser";

type Query = { text: string; start: number };
type Person = Pick<PersonSummary, "id" | "username" | "displayName" | "avatarUrl" | "colour">;

// The post being replied to or quoted, whose people are suggested first.
export type MentionContext = { kind: "none" } | { kind: "reply"; postId: string } | { kind: "quote"; postId: string };

const AT_CARET = /(?:^|[^A-Za-z0-9_.@/])@([A-Za-z0-9_]{0,30})$/;
const LIMIT = 6;

// The database orders suggestions: in a reply, the person replied to, the
// thread's author, others in the thread, then people the writer follows.
async function suggest(text: string, replyTo: string | null, quoteOf: string | null): Promise<Person[]> {
  const { data, error } = await getBrowserClient().rpc("mention_suggestions", { p_query: text, p_reply_to: replyTo, p_quote_of: quoteOf, p_limit: LIMIT });
  return error ? [] : parsePeople(data);
}

export function useMentions({
  textarea,
  body,
  setBody,
  viewerId,
  context,
}: {
  textarea: RefObject<HTMLTextAreaElement | null>;
  body: string;
  setBody: (body: string) => void;
  viewerId: string | null;
  context: MentionContext;
}) {
  const [query, setQuery] = useState<Query | null>(null);
  const [found, setFound] = useState<{ text: string; people: Person[] }>({ text: "", people: [] });
  const [active, setActive] = useState(0);
  const text = query?.text ?? null;
  const results = query && viewerId && found.text === query.text ? found.people : [];
  const replyTo = context.kind === "reply" ? context.postId : null;
  const quoteOf = context.kind === "quote" ? context.postId : null;

  useEffect(() => {
    if (text === null || !viewerId) return;
    const timer = setTimeout(async () => {
      setFound({ text, people: await suggest(text, replyTo, quoteOf) });
      setActive(0);
    }, text ? 150 : 0);
    return () => clearTimeout(timer);
  }, [text, viewerId, replyTo, quoteOf]);

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
