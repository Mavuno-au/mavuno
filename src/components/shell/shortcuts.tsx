"use client";

import { CircleHelp, Clock, Search } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useCompose } from "@/components/shell/compose";
import { Avatar } from "@/components/ui/avatar";
import { Dialog } from "@/components/ui/dialog";
import { useViewer } from "@/components/shell/viewer-context";
import { cn } from "@/lib/cn";
import { parsePeople, type PersonSummary } from "@/lib/domain";
import { findHelp } from "@/lib/help";
import { readRecentSearches, recentSearchesKey, rememberSearch, writeRecentSearches } from "@/lib/recent-searches";
import { readShortcutsEnabled, shortcutKey, subscribeToShortcuts } from "@/lib/shortcuts";
import { getBrowserClient } from "@/lib/supabase/browser";

const SHORTCUTS = [
  ["j / k", "Next or previous post"],
  ["Enter", "Open the post"],
  ["r / q", "Reply to or quote the post"],
  ["o", "Show or hide its replies"],
  ["y", "Copy its link"],
  ["c", "Write a post"],
  ["/  or  ⌘K", "Search people"],
  ["g h", "Go home"],
  ["g d", "Go to Discover"],
  ["g n", "Go to notifications"],
  ["g m", "Go to messages"],
  ["g p", "Go to your profile"],
  ["⌘ Enter", "Post from the composer"],
  ["?", "Show this list"],
] as const;

// Moves focus between the posts on the page, in reading order.
function stepPost(by: 1 | -1) {
  const posts = [...document.querySelectorAll<HTMLElement>("main [data-post]")];
  if (posts.length === 0) return;
  const current = document.activeElement instanceof HTMLElement ? document.activeElement.closest<HTMLElement>("[data-post]") : null;
  const index = current ? posts.indexOf(current) : -1;
  const target = posts[index === -1 ? (by === 1 ? 0 : posts.length - 1) : Math.min(posts.length - 1, Math.max(0, index + by))];
  target?.focus();
  target?.scrollIntoView({ block: "nearest" });
}

function focusedPost() {
  return document.activeElement instanceof HTMLElement ? document.activeElement.closest<HTMLElement>("[data-post]") : null;
}

const isTyping = (target: EventTarget | null) =>
  target instanceof HTMLElement && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));

export function Shortcuts() {
  const router = useRouter();
  const viewer = useViewer();
  const { open: compose } = useCompose();
  const [panel, setPanel] = useState<"none" | "search" | "help">("none");
  const pendingG = useRef(false);

  const enabled = useSyncExternalStore(subscribeToShortcuts, readShortcutsEnabled, () => true);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && shortcutKey(event).toLowerCase() === "k") {
        event.preventDefault();
        setPanel("search");
        return;
      }
      if (!enabled || isTyping(event.target) || event.metaKey || event.ctrlKey || event.altKey || document.querySelector("dialog[open]")) return;
      const key = shortcutKey(event);
      if (pendingG.current) {
        pendingG.current = false;
        const routes: Record<string, string> = { h: "/", d: "/discover", n: "/notifications", m: "/messages", p: viewer ? `/@${viewer.username}` : "/login" };
        const route = routes[key];
        if (route) router.push(route);
        return;
      }
      if (key === "j" || key === "k") {
        event.preventDefault();
        stepPost(key === "j" ? 1 : -1);
        return;
      }
      const post = focusedPost();
      if (post && ["r", "q", "o", "y"].includes(key)) {
        event.preventDefault();
        post.querySelector<HTMLElement>(`[aria-keyshortcuts="${key}"][data-for="${post.dataset.post}"]`)?.click();
        return;
      }
      if (post && key === "Enter" && event.target === post && post.dataset.href) {
        router.push(post.dataset.href);
        return;
      }
      if (key === "g") {
        pendingG.current = true;
        setTimeout(() => (pendingG.current = false), 1000);
      } else if (key === "/") {
        event.preventDefault();
        setPanel("search");
      } else if (key === "?") setPanel("help");
      else if (key === "c" && viewer) {
        event.preventDefault();
        compose();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router, viewer, compose, enabled]);

  return (
    <>
      <SearchPalette open={panel === "search"} onClose={() => setPanel("none")} />
      <Dialog open={panel === "help"} onClose={() => setPanel("none")} title="Keyboard shortcuts">
        {!enabled ? (
          <p className="mb-3 text-sm text-ink-muted">
            Single-key shortcuts are off. Turn them on in{" "}
            <Link href="/settings/appearance" className="text-primary hover:underline" onClick={() => setPanel("none")}>
              Settings › Appearance
            </Link>
            .
          </p>
        ) : null}
        <dl className="grid gap-2">
          {SHORTCUTS.map(([keys, action]) => (
            <div key={keys} className="flex items-center justify-between gap-4 text-[15px]">
              <dt>{action}</dt>
              <dd>
                <kbd className="rounded border border-rail px-1.5 py-0.5 font-mono text-xs">{keys}</kbd>
              </dd>
            </div>
          ))}
        </dl>
        <p className="mt-4 text-sm text-ink-muted">
          Questions about Mavuno itself are answered in{" "}
          <Link href="/help" className="text-primary hover:underline" onClick={() => setPanel("none")}>
            Help
          </Link>
          .
        </p>
      </Dialog>
    </>
  );
}

// The body mounts when the palette opens, so the query starts empty and the
// recent searches come from this browser each time, including another tab's.
export function SearchPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onClose={onClose} title="Search" className="max-w-xl">
      {open ? <SearchPaletteBody onClose={onClose} /> : null}
    </Dialog>
  );
}

function SearchPaletteBody({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const viewer = useViewer();
  const recentKey = viewer ? recentSearchesKey(viewer.id) : null;
  const [query, setQuery] = useState("");
  const [found, setFound] = useState<{ term: string; people: PersonSummary[] }>({ term: "", people: [] });
  const [active, setActive] = useState(0);
  const [recent, setRecent] = useState(() => (recentKey ? readRecentSearches(recentKey) : []));
  const term = query.trim();
  const results = term ? found.people : [];
  const help = findHelp(term);
  const loading = term !== "" && found.term !== term;

  useEffect(() => {
    if (!term) return;
    const timer = setTimeout(async () => {
      const { data } = await getBrowserClient().rpc("search_profiles", { p_query: term, p_limit: 8 });
      setFound({ term, people: parsePeople(data) });
      setActive(0);
    }, 150);
    return () => clearTimeout(timer);
  }, [term]);

  function keepRecent(next: string[]) {
    setRecent(next);
    if (recentKey) writeRecentSearches(recentKey, next);
  }

  function go(path: string) {
    if (term && recentKey) keepRecent(rememberSearch(recent, term));
    onClose();
    router.push(path);
  }

  return (
    <>
      <div className="flex items-center gap-2 rounded-md border border-rail px-3 focus-within:border-primary">
        <Search className="size-4 text-ink-muted" />
        <input
          dir="auto"
          autoFocus
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              event.preventDefault();
              setActive((index) => Math.max(0, Math.min(results.length - 1, index + (event.key === "ArrowDown" ? 1 : -1))));
            }
            if (event.key === "Enter") {
              const person = results[active];
              go(person ? `/@${person.username}` : `/search?q=${encodeURIComponent(term)}`);
            }
          }}
          placeholder="Search people, organisations and posts"
          aria-label="Search"
          className="h-11 w-full bg-transparent text-[17px] focus:outline-none"
        />
      </div>
      {!term && recent.length > 0 ? (
        <div className="mt-2">
          <div className="flex items-center justify-between gap-2 px-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Recent</h3>
            <button type="button" onClick={() => keepRecent([])} className="text-xs text-primary hover:underline">Clear recent searches</button>
          </div>
          <ul className="mt-1 grid">
            {recent.map((item) => (
              <li key={item}>
                <button type="button" onClick={() => setQuery(item)} className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left text-sm hover:bg-wash">
                  <Clock className="size-4 shrink-0 text-ink-muted" aria-hidden />
                  <span className="truncate">{item}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <ul className="mt-2 grid">
        {results.map((person, index) => (
          <li key={person.id}>
            <button type="button" onMouseEnter={() => setActive(index)} onClick={() => go(`/@${person.username}`)} className={cn("flex w-full items-center gap-3 rounded-md px-2 py-2 text-left", index === active && "bg-wash")}>
              <Avatar person={person} size="sm" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">{person.displayName}</span>
                <span className="block truncate font-mono text-xs text-ink-muted">@{person.username}{person.headline ? ` · ${person.headline}` : ""}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
      {help.length > 0 ? (
        <div className="mt-2">
          <h3 className="px-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">Help</h3>
          <ul className="mt-1 grid">
            {help.map((topic) => (
              <li key={topic.slug}>
                <button type="button" onClick={() => go(`/help#${topic.slug}`)} className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left text-sm hover:bg-wash">
                  <CircleHelp className="size-4 shrink-0 text-ink-muted" aria-hidden />
                  <span className="truncate">{topic.question}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <p className="mt-2 text-sm text-ink-muted">
        {!term ? "Type a name or @username." : loading ? "Searching…" : results.length === 0 ? `No people match “${term}”. ` : ""}
        {term.length >= 3 ? (
          <button type="button" className="text-primary hover:underline" onClick={() => go(`/search?q=${encodeURIComponent(term)}`)}>
            Search posts for “{term}”
          </button>
        ) : null}
      </p>
    </>
  );
}
