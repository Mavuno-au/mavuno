"use client";

import { Search } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useCompose } from "@/components/shell/compose";
import { Avatar } from "@/components/ui/avatar";
import { Dialog } from "@/components/ui/dialog";
import { useViewer } from "@/components/shell/viewer-context";
import { cn } from "@/lib/cn";
import { parsePeople, type PersonSummary } from "@/lib/domain";
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
      </Dialog>
    </>
  );
}

export function SearchPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [found, setFound] = useState<{ term: string; people: PersonSummary[] }>({ term: "", people: [] });
  const [active, setActive] = useState(0);
  const term = query.trim();
  const results = term ? found.people : [];
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

  function close() {
    setQuery("");
    onClose();
  }

  function go(path: string) {
    close();
    router.push(path);
  }

  return (
    <Dialog open={open} onClose={close} title="Search" className="max-w-xl">
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
              go(person ? `/@${person.username}` : `/search?q=${encodeURIComponent(query.trim())}`);
            }
          }}
          placeholder="Search people, organisations and posts"
          aria-label="Search"
          className="h-11 w-full bg-transparent text-[17px] focus:outline-none"
        />
      </div>
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
      <p className="mt-2 text-sm text-ink-muted">
        {!query.trim() ? "Type a name or @username." : loading ? "Searching…" : results.length === 0 ? `No people match “${query.trim()}”. ` : ""}
        {query.trim().length >= 3 ? (
          <button type="button" className="text-primary hover:underline" onClick={() => go(`/search?q=${encodeURIComponent(query.trim())}`)}>
            Search posts for “{query.trim()}”
          </button>
        ) : null}
      </p>
    </Dialog>
  );
}
