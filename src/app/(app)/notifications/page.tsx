import type { Metadata } from "next";
import Link from "next/link";
import { loadNotifications } from "@/app/actions/notifications";
import { EmptyState } from "@/components/ui/page";
import { findFilter, isFilterKey, NOTIFICATION_FILTERS } from "@/lib/notifications";
import { requireViewer } from "@/lib/viewer";
import { NotificationList } from "./notification-list";

export const metadata: Metadata = { title: "Notifications" };

export default async function NotificationsPage({ searchParams }: PageProps<"/notifications">) {
  const viewer = await requireViewer("/notifications");
  const params = await searchParams;
  const filter = findFilter(params.filter);
  const identity = viewer.organisations.find((org) => org.username === params.as) ?? viewer;
  const own = identity.id === viewer.id;
  const href = (key: string) => `/notifications?${[`filter=${key}`, own ? "" : `as=${identity.username}`].filter(Boolean).join("&")}`;

  const first = await loadNotifications({ recipientId: identity.id, filter: filter.key, cursor: { kind: "first" } });

  return (
    <NotificationList
      key={`${identity.id}:${filter.key}`}
      recipientId={identity.id}
      owner={identity.username}
      own={own}
      filter={filter.key}
      explicit={isFilterKey(params.filter)}
      initial={first.ok ? first.data : { notifications: [], next: null }}
      header={{
        meta: own ? null : `as ${identity.displayName}`,
        identities:
          viewer.organisations.length > 0
            ? [viewer, ...viewer.organisations].map((profile) => ({
                href: profile.id === viewer.id ? "/notifications" : `/notifications?as=${profile.username}`,
                label: profile.id === viewer.id ? "You" : profile.displayName,
                active: profile.id === identity.id,
              }))
            : null,
        filters: NOTIFICATION_FILTERS.map((item) => ({ href: href(item.key), label: item.label, active: item.key === filter.key })),
      }}
      empty={
        first.ok ? (
          <EmptyState
            title={filter.empty.title}
            action={
              filter.key === "all" ? undefined : (
                <Link href={href("all")} className="text-[15px] font-medium text-primary hover:underline">
                  Show all notifications
                </Link>
              )
            }
          >
            {filter.empty.body}
          </EmptyState>
        ) : (
          <EmptyState title="Couldn't load notifications">Refresh the page to try again.</EmptyState>
        )
      }
    />
  );
}
