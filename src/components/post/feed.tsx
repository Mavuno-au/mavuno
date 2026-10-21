"use client";

import { ArrowUp } from "lucide-react";
import { useRouter } from "next/navigation";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { loadMore, newPostCount } from "@/app/actions/posts";
import { FeedContext, type FeedActions } from "@/components/post/feed-context";
import { PostItem } from "@/components/post/post-item";
import { useViewer } from "@/components/shell/viewer-context";
import { useNow, useTimeZone } from "@/components/ui/local-time";
import { EndOfList } from "@/components/ui/page";
import { lastVisitKey } from "@/lib/browser-data";
import type { PostRow, ReplyPreviews } from "@/lib/domain";
import { feedTime, type FeedSource } from "@/lib/feeds";
import { dayLabel } from "@/lib/format";

const POLL_MS = 30_000;
// Polling stops after this many failures in a row (for example after a deploy
// replaced the server action it calls) instead of hiding the pill each time.
const MAX_POLL_FAILURES = 3;

type Loading = "idle" | "loading" | "failed";

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
  const [loading, setLoading] = useState<Loading>("idle");
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set());
  const [fresh, setFresh] = useState(0);
  const sentinel = useRef<HTMLDivElement>(null);
  const tracksVisits = viewer !== null && (source.kind === "latest" || source.kind === "following");
  const visitKey = viewer ? lastVisitKey(viewer.id, source.kind) : null;

  // A refresh from the server (after posting, pinning or "new posts") brings a
  // new first page. While it still joins onto the pages loaded below it, those
  // stay, and so does the reader's place. Trending draws again on a refresh.
  if (seed !== initial) {
    const joinsAt = initialNext !== null && source.kind !== "trending" ? rows.findIndex((row) => row.id === initial.at(-1)?.id) : -1;
    const below = joinsAt === -1 ? [] : rows.slice(joinsAt + 1).filter((row) => !initial.some((item) => item.id === row.id));
    setSeed(initial);
    setRows([...initial, ...below]);
    setPreviews(below.length > 0 ? { ...previews, ...initialPreviews } : initialPreviews);
    setNext(below.length > 0 ? next : initialNext);
    setLoading("idle");
    setFresh(0);
  }

  const sortTime = (row: PostRow) => (source.kind === "latest" || source.kind === "following" ? feedTime(row) : row.createdAt);
  const newest = rows[0] ? sortTime(rows[0]) : undefined;
  const lastVisit = useSyncExternalStore(subscribeToNothing, () => (tracksVisits && visitKey ? readLastVisit(visitKey) : null), () => null);

  useEffect(() => {
    if (!tracksVisits || !visitKey || !newest) return;
    readLastVisit(visitKey);
    writeLastVisit(visitKey, newest);
  }, [tracksVisits, visitKey, newest]);

  useEffect(() => () => void (visitKey && firstReads.delete(visitKey)), [visitKey]);

  const showMore = useCallback(() => {
    if (!next) return;
    setLoading("loading");
    loadMore(source, next).then(
      (page) => {
        setRows((current) => [...current, ...page.posts.filter((post) => !current.some((row) => row.id === post.id))]);
        setPreviews((current) => ({ ...page.previews, ...current }));
        setNext(page.next);
        setLoading("idle");
      },
      // Waits for "Try again": retrying on its own would loop while offline.
      () => setLoading("failed"),
    );
  }, [next, source]);

  useEffect(() => {
    const element = sentinel.current;
    if (!element || !next || loading !== "idle") return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        observer.disconnect();
        showMore();
      },
      { rootMargin: "800px" },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [next, loading, showMore]);

  const actions = useMemo<FeedActions>(
    () => ({
      hidden,
      hideAuthor(authorId, relation) {
        // A muted person's own profile still lists their posts; blocking them makes the whole profile unavailable.
        if (source.kind === "profile" && source.profileId === authorId) {
          if (relation === "block") router.refresh();
          return;
        }
        setHidden((current) => new Set(current).add(authorId));
      },
      // Only a profile shows which post is pinned.
      pinChanged(authorId) {
        if (source.kind === "profile" && source.profileId === authorId) router.refresh();
      },
    }),
    [hidden, source, router],
  );

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

  const excluded = new Set(exclude);
  const shown = [...prepend.filter((post) => !rows.some((row) => row.id === post.id)), ...rows].filter((row) => !excluded.has(row.id) && !(row.kind === "post" && hidden.has(row.authorId)));
  const someoneElseBefore = (index: number) => shown.slice(0, index).some((newer) => newer.kind === "post" && newer.createdBy !== viewer?.id);
  const markerIndex = tracksVisits && lastVisit ? shown.findIndex((row, index) => index > 0 && sortTime(row) <= lastVisit && someoneElseBefore(index)) : -1;

  if (shown.length === 0) return <>{empty}</>;

  return (
    <FeedContext value={actions}>
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
          const label = dayLabel(sortTime(row), today, timeZone);
          const previous = shown[index - 1];
          const day = dayMarkers && (!previous || dayLabel(sortTime(previous), today, timeZone) !== label);
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
        {loading === "loading" ? <FeedSkeleton rows={2} /> : null}
        {loading === "failed" ? (
          <p role="alert" className="flex items-center justify-center gap-3 px-4 py-6 text-sm text-ink-muted">
            Couldn't load more posts.
            <button type="button" className="font-medium text-primary hover:underline" onClick={showMore}>
              Try again
            </button>
          </p>
        ) : null}
        {!next ? <EndOfList>{end}</EndOfList> : null}
      </div>
    </FeedContext>
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
