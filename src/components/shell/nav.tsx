"use client";

import {
  Activity,
  Bell,
  Bookmark,
  BriefcaseBusiness,
  CalendarClock,
  CalendarDays,
  Compass,
  Ellipsis,
  House,
  LogOut,
  MapPinned,
  MessagesSquare,
  Search,
  Settings2,
  ShieldCheck,
  SquarePen,
  UserRound,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { signOut } from "@/app/actions/auth";
import { Mark, Wordmark } from "@/components/shell/brand";
import { useCompose } from "@/components/shell/compose";
import { useCounts } from "@/components/shell/live-counts";
import { ThemeToggle } from "@/components/shell/theme-toggle";
import { useViewer } from "@/components/shell/viewer-context";
import { Avatar } from "@/components/ui/avatar";
import { ButtonLink } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Menu, type MenuItem } from "@/components/ui/menu";
import { forgetBrowserData } from "@/lib/browser-data";
import { cn } from "@/lib/cn";
import type { Viewer } from "@/lib/viewer";

function leave(viewerId: string) {
  forgetBrowserData(viewerId);
  void signOut();
}

type Item = { href: string; label: string; icon: LucideIcon; count?: number; match?: (path: string) => boolean };

const startsWith = (...prefixes: string[]) => (path: string) => prefixes.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));

function useItems() {
  const viewer = useViewer();
  const counts = useCounts();
  const explore: Item[] = [
    { href: "/", label: "Home", icon: House, match: (path) => path === "/" || path === "/latest" || path === "/trending" },
    { href: "/discover", label: "Discover", icon: Compass, match: startsWith("/discover", "/search", "/topics") },
    { href: "/nearby", label: "Nearby", icon: MapPinned },
    { href: "/spaces", label: "Spaces", icon: UsersRound },
    { href: "/events", label: "Events", icon: CalendarDays },
    { href: "/opportunities", label: "Opportunities", icon: BriefcaseBusiness },
  ];
  const mine: Item[] = viewer
    ? [
        { href: "/messages", label: "Messages", icon: MessagesSquare, count: counts.messages },
        { href: "/notifications", label: "Notifications", icon: Bell, count: counts.notifications },
        { href: "/saved", label: "Saved", icon: Bookmark },
        { href: `/@${viewer.username}`, label: "Profile", icon: UserRound, match: startsWith(`/@${viewer.username}`, `/u/${viewer.username}`) },
      ]
    : [];
  const staff: Item[] = [];
  if (viewer?.role === "moderator" || viewer?.role === "admin") staff.push({ href: "/moderation", label: "Moderation", icon: ShieldCheck });
  if (viewer?.role === "admin") staff.push({ href: "/operations", label: "Operations", icon: Activity });
  return { explore, mine, staff };
}

const isActive = (item: Item, path: string) => (item.match ? item.match(path) : startsWith(item.href)(path));

function accountMenu(viewer: Viewer): MenuItem[] {
  return [
    { kind: "link", label: "Your profile", icon: <UserRound />, href: `/@${viewer.username}` },
    { kind: "link", label: "Scheduled posts", icon: <CalendarClock />, href: "/scheduled" },
    { kind: "link", label: "Settings", icon: <Settings2 />, href: "/settings" },
    { kind: "action", label: "Sign out", icon: <LogOut />, onSelect: () => leave(viewer.id) },
  ];
}

function NavLink({ item, path }: { item: Item; path: string }) {
  const active = isActive(item, path);
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      title={item.label}
      className={cn(
        "relative flex h-11 shrink-0 items-center gap-3.5 rounded-lg px-3 text-[15px] font-medium transition-colors max-lg:justify-center",
        active ? "bg-primary-soft text-primary" : "text-ink-muted hover:bg-wash hover:text-ink",
      )}
    >
      <Icon className="size-5 shrink-0" strokeWidth={active ? 2.4 : 1.9} aria-hidden />
      <span className="hidden min-w-0 flex-1 truncate lg:inline">{item.label}</span>
      {item.count ? (
        <>
          <span className="hidden min-w-5 rounded-full bg-primary px-1.5 text-center font-mono text-[11px] leading-5 text-primary-ink tabular lg:inline">
            {item.count > 99 ? "99+" : item.count}
          </span>
          <span className="absolute top-2 right-2 size-2 rounded-full bg-primary lg:hidden" aria-label={`${item.count} unread`} />
        </>
      ) : null}
    </Link>
  );
}

// The logo and account stay put; only the list of places scrolls on short screens.
export function SideNav() {
  const path = usePathname();
  const viewer = useViewer();
  const { open } = useCompose();
  const { explore, mine, staff } = useItems();

  return (
    <nav aria-label="Main" className="sticky top-0 hidden h-dvh flex-col px-3 py-3 md:flex">
      <div className="flex h-12 shrink-0 items-center px-3 max-lg:justify-center">
        <span className="hidden lg:inline">
          <Wordmark />
        </span>
        <Link href="/" aria-label="Mavuno home" className="lg:hidden">
          <Mark className="h-7" />
        </Link>
      </div>

      <div className="-mx-1 mt-2 flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-1 [scrollbar-width:thin]">
        {explore.map((item) => (
          <NavLink key={item.href} item={item} path={path} />
        ))}
        {mine.length > 0 ? <hr className="mx-3 my-1.5 border-hairline" /> : null}
        {mine.map((item) => (
          <NavLink key={item.href} item={item} path={path} />
        ))}
        {staff.length > 0 ? <hr className="mx-3 my-1.5 border-hairline" /> : null}
        {staff.map((item) => (
          <NavLink key={item.href} item={item} path={path} />
        ))}
        <span className="xl:hidden">
          <NavLink item={{ href: "/search", label: "Search", icon: Search }} path={path} />
        </span>
      </div>

      <div className="mt-3 grid shrink-0 gap-2">
        {viewer ? (
          <button
            type="button"
            onClick={() => open()}
            title="New post (c)"
            className="flex h-11 items-center justify-center gap-2 rounded-lg bg-primary font-medium text-primary-ink transition-colors hover:bg-primary-hover"
          >
            <SquarePen className="size-5" aria-hidden />
            <span className="hidden lg:inline">New post</span>
          </button>
        ) : (
          <>
            <ButtonLink href="/signup" size="lg" className="hidden lg:flex">Join Mavuno</ButtonLink>
            <ButtonLink href="/login" size="lg" variant="outline" className="max-lg:size-11 max-lg:px-0">
              <span className="hidden lg:inline">Sign in</span>
              <UserRound className="lg:hidden" aria-label="Sign in" />
            </ButtonLink>
          </>
        )}

        <div className="flex items-center gap-1 border-t border-hairline pt-2 max-lg:flex-col">
          {viewer ? (
            <Menu
              label="Account"
              align="start"
              placement="above"
              items={accountMenu(viewer)}
              trigger={
                <span className="flex min-w-0 items-center gap-3 lg:w-44">
                  <Avatar person={viewer} size="sm" />
                  <span className="hidden min-w-0 text-left lg:block">
                    <span className="block truncate text-sm font-semibold text-ink">{viewer.displayName}</span>
                    <span className="block truncate font-mono text-xs text-ink-muted">@{viewer.username}</span>
                  </span>
                </span>
              }
            />
          ) : null}
          <ThemeToggle className="lg:ml-auto" />
        </div>
      </div>
    </nav>
  );
}

const MOBILE_PRIMARY = ["/", "/discover", "/events", "/messages", "/notifications"];

export function MobileNav() {
  const path = usePathname();
  const viewer = useViewer();
  const { explore, mine, staff } = useItems();
  const [more, setMore] = useState(false);
  const all = [...explore, ...mine, ...staff];
  const primary = all.filter((item) => MOBILE_PRIMARY.includes(item.href)).slice(0, 4);
  const rest = all.filter((item) => !primary.includes(item));
  const restActive = rest.some((item) => isActive(item, path));

  return (
    <>
      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-30 grid border-t border-hairline bg-surface pb-[env(safe-area-inset-bottom)] md:hidden"
        style={{ gridTemplateColumns: `repeat(${primary.length + 1}, 1fr)` }}
      >
        {primary.map((item) => {
          const active = isActive(item, path);
          const Icon = item.icon;
          return (
            <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined} className={cn("relative flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium", active ? "text-primary" : "text-ink-muted")}>
              <span className={cn("flex h-8 w-14 items-center justify-center rounded-full", active && "bg-primary-soft")}>
                <Icon className="size-5" strokeWidth={active ? 2.4 : 1.9} aria-hidden />
              </span>
              {item.label}
              {item.count ? <span className="absolute top-1.5 left-[calc(50%+8px)] size-2 rounded-full bg-primary" /> : null}
            </Link>
          );
        })}
        <button type="button" onClick={() => setMore(true)} aria-haspopup="dialog" className={cn("flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium", restActive ? "text-primary" : "text-ink-muted")}>
          <span className={cn("flex h-8 w-14 items-center justify-center rounded-full", restActive && "bg-primary-soft")}>
            <Ellipsis className="size-5" aria-hidden />
          </span>
          More
        </button>
      </nav>
      <Dialog open={more} onClose={() => setMore(false)} title="Mavuno">
        <ul className="grid grid-cols-3 gap-2">
          {rest.map((item) => {
            const Icon = item.icon;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={() => setMore(false)}
                  className={cn("flex flex-col items-center gap-1.5 rounded-lg px-2 py-3 text-xs font-medium", isActive(item, path) ? "bg-primary-soft text-primary" : "text-ink hover:bg-wash")}
                >
                  <Icon className="size-5" aria-hidden />
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
        {viewer ? null : (
          <div className="mt-4 grid gap-2">
            <ButtonLink href="/signup" onClick={() => setMore(false)}>Join Mavuno</ButtonLink>
            <ButtonLink href="/login" variant="outline" onClick={() => setMore(false)}>Sign in</ButtonLink>
          </div>
        )}
      </Dialog>
    </>
  );
}

export function MobileHeader() {
  const viewer = useViewer();
  const { open } = useCompose();
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-hairline bg-surface px-4 md:hidden">
      <Wordmark />
      <div className="flex items-center gap-1">
        <ThemeToggle />
        {viewer ? (
          <>
            <button type="button" onClick={() => open()} aria-label="New post" className="rounded-md p-2 text-primary hover:bg-wash">
              <SquarePen className="size-5" />
            </button>
            <Menu label="Account" trigger={<Avatar person={viewer} size="sm" />} items={accountMenu(viewer)} />
          </>
        ) : (
          <ButtonLink href="/login" size="sm">Sign in</ButtonLink>
        )}
      </div>
    </header>
  );
}
