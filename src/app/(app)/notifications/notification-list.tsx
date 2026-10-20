"use client";

import { ArrowUp } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Fragment, useEffect, useRef, useState, useSyncExternalStore, useTransition, type ReactNode } from "react";
import { loadNotifications, markNotificationsRead, type NotificationPage } from "@/app/actions/notifications";
import { FeedSkeleton } from "@/components/post/feed";
import { useCounts } from "@/components/shell/live-counts";
import { useTimeZone } from "@/components/ui/local-time";
import { Button } from "@/components/ui/button";
import { EndOfList, PageHeader, Tabs, type Tab } from "@/components/ui/page";
import { dayLabel } from "@/lib/format";
import { groupNotifications, isFilterKey, type NotificationFilterKey } from "@/lib/notifications";
import { NotificationRow } from "./notification-row";

const POLL_MS = 30_000;
const STORAGE_KEY = "mavuno:notification-filter";
const UNKNOWN = "unknown";

type Header = { meta: string | null; identities: Tab[] | null; filters: Tab[] };

function readSavedFilter(): NotificationFilterKey | null {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    return isFilterKey(saved) ? saved : null;
  } catch {
    return null;
  }
}

function saveFilter(filter: NotificationFilterKey) {
  try {
    window.localStorage.setItem(STORAGE_KEY, filter);
  } catch {}
}

const subscribe = () => () => {};

// A visit without a filter in the address reopens the one chosen last time.
// The server can't know it, so nothing renders until the browser has looked.
export function NotificationList({
  recipientId,
  owner,
  own,
  filter,
  explicit,
  initial,
  header,
  empty,
}: {
  recipientId: string;
  owner: string;
  own: boolean;
  filter: NotificationFilterKey;
  explicit: boolean;
  initial: NotificationPage;
  header: Header;
  empty: ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const saved = useSyncExternalStore(subscribe, readSavedFilter, () => UNKNOWN);
  const restoreTo = explicit ? null : saved === UNKNOWN ? UNKNOWN : saved !== null && saved !== filter ? saved : null;

  useEffect(() => {
    if (explicit) saveFilter(filter);
  }, [explicit, filter]);

  useEffect(() => {
    if (!restoreTo || restoreTo === UNKNOWN) return;
    const params = new URLSearchParams(searchParams);
    params.set("filter", restoreTo);
    router.replace(`${pathname}?${params}`, { scroll: false });
  }, [restoreTo, pathname, router, searchParams]);

  if (restoreTo) {
    return (
      <>
        <NotificationHeader header={header} />
        <FeedSkeleton rows={6} />
      </>
    );
  }
  return <Inbox recipientId={recipientId} owner={owner} own={own} filter={filter} initial={initial} header={header} empty={empty} />;
}

function NotificationHeader({ header, pill }: { header: Header; pill?: ReactNode }) {
  return (
    <PageHeader title="Notifications" meta={header.meta ?? undefined}>
      {header.identities ? <Tabs className="border-b border-hairline" tabs={header.identities} /> : null}
      <Tabs tabs={header.filters} />
      {pill}
    </PageHeader>
  );
}

function Inbox({
  recipientId,
  owner,
  own,
  filter,
  initial,
  header,
  empty,
}: {
  recipientId: string;
  owner: string;
  own: boolean;
  filter: NotificationFilterKey;
  initial: NotificationPage;
  header: Header;
  empty: ReactNode;
}) {
  const timeZone = useTimeZone();
  const { clear } = useCounts();
  const [rows, setRows] = useState(initial.notifications);
  const [next, setNext] = useState(initial.next);
  const [arrived, setArrived] = useState<NotificationPage | null>(null);
  const [failed, setFailed] = useState(false);
  const [loading, startLoading] = useTransition();
  const sentinel = useRef<HTMLDivElement>(null);

  const newest = rows[0]?.createdAt ?? null;
  const latestUnread = rows.find((row) => row.unread)?.id ?? null;

  // Rows keep their unread look for this visit; the database is told after they have been seen.
  useEffect(() => {
    if (own) clear("notifications");
    if (latestUnread !== null) void markNotificationsRead(recipientId);
  }, [latestUnread, own, recipientId, clear]);

  function merge(page: NotificationPage) {
    setArrived(null);
    // A full page of arrivals may not reach what is already shown, so it replaces the list.
    if (page.next) {
      setRows(page.notifications);
      setNext(page.next);
      return;
    }
    setRows((current) => [...page.notifications.filter((row) => !current.some((shown) => shown.id === row.id)), ...current]);
  }

  useEffect(() => {
    const timer = setInterval(async () => {
      if (document.visibilityState !== "visible") return;
      const result = await loadNotifications({ recipientId, filter, cursor: newest ? { kind: "after", at: newest } : { kind: "first" } }).catch(() => null);
      if (!result?.ok) return;
      const page = result.data;
      // With nothing on screen there is nothing to keep in place.
      if (newest === null) {
        setRows(page.notifications);
        setNext(page.next);
        return;
      }
      setArrived(page.notifications.length > 0 ? page : null);
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [recipientId, filter, newest]);

  function loadOlder() {
    if (!next) return;
    startLoading(async () => {
      const result = await loadNotifications({ recipientId, filter, cursor: { kind: "before", at: next } }).catch(() => null);
      if (!result?.ok) {
        setFailed(true);
        return;
      }
      setFailed(false);
      setRows((current) => [...current, ...result.data.notifications.filter((row) => !current.some((shown) => shown.id === row.id))]);
      setNext(result.data.next);
    });
  }

  useEffect(() => {
    const element = sentinel.current;
    if (!element || !next || failed || loading) return;
    const observer = new IntersectionObserver(([entry]) => entry?.isIntersecting && loadOlder(), { rootMargin: "800px" });
    observer.observe(element);
    return () => observer.disconnect();
  });

  const groups = groupNotifications(rows, timeZone);
  const leftOff = groups.findIndex((group, index) => index > 0 && !group.unread && groups[index - 1]?.unread);
  const now = new Date();
  const fresh = arrived?.notifications.length ?? 0;

  const pill =
    arrived ? (
      <div className="pointer-events-none absolute inset-x-0 top-full flex justify-center pt-3">
        <button
          type="button"
          onClick={() => {
            merge(arrived);
            window.scrollTo({ top: 0, behavior: "smooth" });
          }}
          className="animate-fade-in pointer-events-auto flex items-center gap-1.5 rounded-full bg-primary px-4 py-1.5 text-sm font-medium text-primary-ink shadow-md"
        >
          <ArrowUp className="size-4" />
          <span className="font-mono tabular">{arrived.next ? `${fresh}+` : fresh}</span> {fresh === 1 ? "new notification" : "new notifications"}
        </button>
      </div>
    ) : null;

  return (
    <>
      <NotificationHeader header={header} pill={pill} />
      {groups.length === 0 ? (
        empty
      ) : (
        <>
          {groups.map((group, index) => {
            const label = dayLabel(group.latest.createdAt, now, timeZone);
            const previous = groups[index - 1];
            const startsDay = !previous || dayLabel(previous.latest.createdAt, now, timeZone) !== label;
            return (
              <Fragment key={group.key}>
                {index === leftOff ? (
                  <p className="flex items-center gap-3 border-b border-hairline px-4 py-1.5 font-mono text-xs text-primary sm:px-6">
                    <span className="h-px flex-1 bg-primary/30" />
                    Where you left off
                    <span className="h-px flex-1 bg-primary/30" />
                  </p>
                ) : null}
                {startsDay ? <p className="border-b border-hairline px-4 py-1.5 font-mono text-xs text-ink-muted sm:px-6" suppressHydrationWarning>{label}</p> : null}
                <NotificationRow group={group} owner={owner} followable={own} />
              </Fragment>
            );
          })}
          <div ref={sentinel} />
          {loading ? <FeedSkeleton rows={2} /> : null}
          {failed ? (
            <div className="flex flex-col items-center gap-2 px-6 py-8 text-sm text-ink-muted">
              Couldn't load older notifications.
              <Button variant="outline" size="sm" onClick={loadOlder}>
                Try again
              </Button>
            </div>
          ) : null}
          {!next ? <EndOfList>That's the oldest notification.</EndOfList> : null}
        </>
      )}
    </>
  );
}
