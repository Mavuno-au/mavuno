"use client";

import { ArrowUp } from "lucide-react";
import { useRouter } from "next/navigation";
import { Fragment, useEffect, useRef, useState, useSyncExternalStore, useTransition, type ReactNode } from "react";
import { toast } from "sonner";
import { loadMore, newPostCount } from "@/app/actions/posts";
import { PostItem } from "@/components/post/post-item";
import { useViewer } from "@/components/shell/viewer-context";
import { useNow, useTimeZone } from "@/components/ui/local-time";
import { EndOfList } from "@/components/ui/page";
import { lastVisitKey } from "@/lib/browser-data";
import type { PostRow, ReplyPreviews } from "@/lib/domain";
import type { FeedSource } from "@/lib/feeds";
import { dayLabel } from "@/lib/format";

const POLL_MS = 30_000;
// Polling stops after this many failures in a row (for example after a deploy
// replaced the server action it calls) instead of hiding the pill each time.
const MAX_POLL_FAILURES = 3;

const firstReads = new Map<string, string | null>();
const subscribeToNothing = () => () => {};

// The last visit as it was when this feed first rendered, so the marker
// doesn't move while the newest post seen is updated underneath it.
function readLastVisit(key: string) {
  if (!firstReads.has(key)) {
    try {
      firstReads.set(key, localStorage.getItem(key));
    } catch {
      firstReads.set(key, null);
    }
  }
  return firstReads.get(key) ?? null;
}

function writeLastVisit(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {}
}

export function Feed({
  source,
  initial,
  previews: initialPreviews = {},
  next: initialNext,
  prepend = [],
  exclude = [],
  insert,
  empty,
  end = "You're all caught up.",
  dayMarkers = true,
}: {
  source: FeedSource;
  initial: PostRow[];
  previews?: ReplyPreviews;
  next: string | null;
  prepend?: PostRow[];
  exclude?: string[];
  insert?: { after: number; node: ReactNode };
  empty: ReactNode;
  end?: string;
  dayMarkers?: boolean;
}) {
  const router = useRouter();
  const viewer = useViewer();
  const timeZone = useTimeZone();
  const today = new Date(useNow());
  const [rows, setRows] = useState(initial);
  const [previews, setPreviews] = useState(initialPreviews);
  const [next, setNext] = useState(initialNext);
  const [seed, setSeed] = useState(initial);
  const [pending, startTransition] = useTransition();
  const [fresh, setFresh] = useState(0);
  const sentinel = useRef<HTMLDivElement>(null);
  const tracksVisits = viewer !== null && (source.kind === "latest" || source.kind === "following");
  const visitKey = viewer ? lastVisitKey(viewer.id, source.kind) : null;

  // A refresh from the server replaces what was loaded so far.
  if (seed !== initial) {
    setSeed(initial);
    setRows(initial);
    setPreviews(initialPreviews);
    setNext(initialNext);
    setFresh(0);
  }

  const newest = rows[0]?.createdAt;
  const lastVisit = useSyncExternalStore(subscribeToNothing, () => (tracksVisits && visitKey ? readLastVisit(visitKey) : null), () => null);

  useEffect(() => {
    if (!tracksVisits || !visitKey || !newest) return;
    readLastVisit(visitKey);
    writeLastVisit(visitKey, newest);
  }, [tracksVisits, visitKey, newest]);

  useEffect(() => () => void (visitKey && firstReads.delete(visitKey)), [visitKey]);

  useEffect(() => {
    const element = sentinel.current;
    if (!element || !next) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting || pending) return;
        startTransition(async () => {
          try {
            const page = await loadMore(source, next);
            setRows((current) => [...current, ...page.posts.filter((post) => !current.some((row) => row.id === post.id))]);
            setPreviews((current) => ({ ...page.previews, ...current }));
            setNext(page.next);
          } catch {
            toast.error("Couldn't load more posts. Scroll to try again.");
          }
        });
      },
      { rootMargin: "800px" },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [next, pending, source]);

  useEffect(() => {
    if ((source.kind !== "latest" && source.kind !== "following") || !newest) return;
    const feed = source.kind;
    let failures = 0;
    const timer = setInterval(async () => {
      if (document.visibilityState !== "visible") return;
      try {
        setFresh(await newPostCount(feed, newest));
        failures = 0;
      } catch {
        failures += 1;
        if (failures >= MAX_POLL_FAILURES) clearInterval(timer);
      }
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [source.kind, newest]);

  const hidden = new Set(exclude);
  const shown = [...prepend.filter((post) => !rows.some((row) => row.id === post.id)), ...rows].filter((row) => !hidden.has(row.id));
  const someoneElseBefore = (index: number) => shown.slice(0, index).some((newer) => newer.kind === "post" && newer.createdBy !== viewer?.id);
  const markerIndex = tracksVisits && lastVisit ? shown.findIndex((row, index) => index > 0 && row.createdAt <= lastVisit && someoneElseBefore(index)) : -1;

  if (shown.length === 0) return <>{empty}</>;

  return (
    <div className="relative">
      {fresh > 0 ? (
        <NewPostsPill
          count={fresh}
          onClick={() => {
            setFresh(0);
            window.scrollTo({ top: 0, behavior: "smooth" });
            router.refresh();
          }}
        />
      ) : null}
      {shown.map((row, index) => {
        const label = dayLabel(row.createdAt, today, timeZone);
        const previous = shown[index - 1];
        const day = dayMarkers && (!previous || dayLabel(previous.createdAt, today, timeZone) !== label);
        return (
          <Fragment key={row.id}>
            {index === markerIndex ? (
              <p className="flex items-center gap-3 px-4 py-1.5 font-mono text-xs text-ink-muted sm:px-6">
                <span className="flex-1 border-t border-dashed border-rail" />
                where you left off
                <span className="flex-1 border-t border-dashed border-rail" />
              </p>
            ) : null}
            {day ? (
              <p className="border-b border-hairline px-4 py-1.5 font-mono text-xs text-ink-muted sm:px-6" suppressHydrationWarning>
                {label}
              </p>
            ) : null}
            <PostItem row={row} previews={previews[row.id]} />
            {insert && index === insert.after - 1 ? insert.node : null}
          </Fragment>
        );
      })}
      <div ref={sentinel} />
      {pending ? <FeedSkeleton rows={2} /> : null}
      {!next ? <EndOfList>{end}</EndOfList> : null}
    </div>
  );
}

// Hangs just under the page's sticky header, whatever its height on this screen.
function NewPostsPill({ count, onClick }: { count: number; onClick: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [top, setTop] = useState(64);

  useEffect(() => {
    const header = ref.current?.closest("main")?.querySelector("header");
    if (!header) return;
    const measure = () => setTop(Number.parseFloat(getComputedStyle(header).top) + header.offsetHeight + 8);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(header);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} className="sticky z-30 flex justify-center" style={{ top }}>
      <button type="button" onClick={onClick} className="animate-fade-in -mb-9 mt-2 flex items-center gap-1.5 rounded-full bg-primary px-4 py-1.5 text-sm font-medium text-primary-ink shadow-md">
        <ArrowUp className="size-4" /> {count === 1 ? "1 new post" : `${count} new posts`}
      </button>
    </div>
  );
}

export function FeedSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div aria-hidden className="animate-[fade-in_160ms_ease-out_300ms_both]">
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="flex gap-3 border-b border-hairline px-4 py-4 sm:px-6">
          <div className="size-10 shrink-0 animate-pulse rounded-full bg-wash" />
          <div className="grid flex-1 gap-2 pt-1">
            <div className="h-3.5 w-40 animate-pulse rounded bg-wash" />
            <div className="h-3.5 w-full animate-pulse rounded bg-wash" />
            <div className="h-3.5 w-2/3 animate-pulse rounded bg-wash" />
          </div>
        </div>
      ))}
    </div>
  );
}
