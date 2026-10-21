import { Search } from "lucide-react";
import Link from "next/link";
import { SpaceAvatar } from "@/components/community/city-photo";
import { WhoToFollow } from "@/components/people/who-to-follow";
import { Avatar, ColourDot } from "@/components/ui/avatar";
import { ButtonLink } from "@/components/ui/button";
import { loadActiveSpaces } from "@/lib/data/discover";
import { loadTrendingTopics, loadViewerCard, loadViewerCity, loadWhoToFollowBlock } from "@/lib/data/shell";
import { compact } from "@/lib/format";
import type { Viewer } from "@/lib/viewer";

// Wide screens only (xl). Narrower screens get Who to follow inside the feed.
export async function Aside({ viewer }: { viewer: Viewer | null }) {
  const [card, people, city, topics] = await Promise.all([loadViewerCard(viewer), loadWhoToFollowBlock(viewer), loadViewerCity(viewer), loadTrendingTopics(5)]);
  // While the network is small there may be nobody left to suggest; spaces are the next way in.
  const spaces = people.kind === "empty" ? await loadActiveSpaces(3) : [];

  return (
    <aside className="sticky top-0 hidden h-dvh w-80 shrink-0 flex-col gap-6 overflow-y-auto px-6 py-4 xl:flex">
      <form action="/search" className="flex items-center gap-2 rounded-full border border-rail bg-surface px-4 focus-within:border-primary">
        <Search className="size-4 text-ink-muted" />
        <input name="q" dir="auto" placeholder="Search Mavuno" aria-label="Search Mavuno" className="h-10 w-full bg-transparent text-sm focus:outline-none" />
        <kbd className="rounded border border-rail px-1 font-mono text-[10px] text-ink-muted">/</kbd>
      </form>

      {viewer && card ? (
        <section className="rounded-xl border border-hairline bg-surface p-4">
          <Link href={`/@${viewer.username}`} className="flex items-center gap-3">
            <Avatar person={viewer} ring />
            <span className="min-w-0">
              <span className="block truncate font-semibold hover:underline">{viewer.displayName}</span>
              <span className="flex items-center gap-1.5 font-mono text-xs text-ink-muted">
                <ColourDot colour={viewer.colour} />@{viewer.username}
              </span>
            </span>
          </Link>
          {card.bio ? (
            <p dir="auto" className="mt-3 line-clamp-2 text-sm text-ink-muted">
              {card.bio}
            </p>
          ) : null}
          <dl className="mt-3 flex gap-4 font-mono text-xs text-ink-muted">
            <Count href={`/@${viewer.username}`} value={card.posts} label="posts" />
            <Count href={`/@${viewer.username}/following`} value={card.following} label="following" />
            <Count href={`/@${viewer.username}/followers`} value={card.followers} label={card.followers === 1 ? "follower" : "followers"} />
          </dl>
        </section>
      ) : (
        <section className="rounded-xl border border-hairline bg-surface p-4">
          <h2 className="font-semibold">New to Mavuno?</h2>
          <p className="mt-1 text-sm text-ink-muted">Join to follow people and organisations, reply to posts and find your city's space.</p>
          <ButtonLink href="/signup" className="mt-3 w-full">Join Mavuno</ButtonLink>
          <p className="mt-2 text-center text-xs text-ink-muted">
            Already a member? <Link href="/login" className="text-primary hover:underline">Sign in</Link>
          </p>
        </section>
      )}

      {viewer && !viewer.cityId ? (
        <section className="rounded-xl border border-hairline bg-surface p-4 text-sm">
          <p className="font-semibold">Find people near you</p>
          <p className="mt-1 text-ink-muted">Add your city to see events, spaces and members nearby. Only your city is shown, never where you are.</p>
          <Link href="/settings" className="mt-2 inline-block font-medium text-primary hover:underline">Add your city</Link>
        </section>
      ) : null}

      {people.kind === "page" ? (
        <WhoToFollow initial={people.page} />
      ) : spaces.length > 0 ? (
        <section>
          <h2 className="mb-2 text-sm font-semibold">Spaces to join</h2>
          <ul className="grid gap-1">
            {spaces.map((space) => (
              <li key={space.slug}>
                <Link href={`/spaces/${space.slug}`} className="-mx-2 flex items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-wash">
                  <SpaceAvatar photo={space.photo} emoji={space.emoji} />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{space.name}</span>
                    <span className="block font-mono text-xs text-ink-muted">{space.members === 0 ? "No members yet" : `${compact(space.members)} ${space.members === 1 ? "member" : "members"}`}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          <Link href="/spaces" className="mt-1 inline-block text-sm text-primary hover:underline">All spaces</Link>
        </section>
      ) : null}

      {city ? (
        <section className="text-sm">
          <h2 className="mb-2 font-semibold">Around {city.name}</h2>
          <ul className="grid gap-1.5 text-ink-muted">
            <li><Link href={`/spaces/${city.slug}`} className="hover:text-primary">The {city.name} space</Link></li>
            <li><Link href="/events" className="hover:text-primary">Upcoming events nearby</Link></li>
            <li><Link href="/nearby" className="hover:text-primary">People and posts nearby</Link></li>
          </ul>
        </section>
      ) : null}

      {topics.length > 0 ? (
        <section>
          <h2 className="mb-2 text-sm font-semibold">Talked about this week</h2>
          <ul className="grid gap-2">
            {topics.map((topic) => (
              <li key={topic.topic}>
                <Link href={`/topics/${topic.topic}`} className="group block text-sm">
                  <span className="font-medium group-hover:text-primary">#{topic.topic}</span>
                  <span className="block font-mono text-xs text-ink-muted">
                    {compact(topic.people)} {topic.people === 1 ? "person" : "people"} · {compact(topic.posts)} posts
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <footer className="mt-auto flex flex-wrap gap-x-3 gap-y-1 text-xs text-ink-muted">
        <Link href="/about" className="hover:text-ink">About</Link>
        <Link href="/help" className="hover:text-ink">Help</Link>
        <Link href="/rules" className="hover:text-ink">Community rules</Link>
        <Link href="/privacy" className="hover:text-ink">Privacy</Link>
        <Link href="/terms" className="hover:text-ink">Terms</Link>
        <Link href="/brand" className="hover:text-ink">Brand</Link>
        <span>Press ? for shortcuts</span>
      </footer>
    </aside>
  );
}

function Count({ href, value, label }: { href: string; value: number; label: string }) {
  return (
    <Link href={href} className="hover:text-primary">
      <span className="font-semibold text-ink tabular">{compact(value)}</span> {label}
    </Link>
  );
}
