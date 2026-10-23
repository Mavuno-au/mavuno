import { Search } from "lucide-react";
import Link from "next/link";
import { SpaceAvatar } from "@/components/community/city-photo";
import { PersonRow } from "@/components/people/person-row";
import { PostItem } from "@/components/post/post-item";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState, PageHeader, Section, Tabs } from "@/components/ui/page";
import { loadActiveSpaces, loadSuggestedOrganisations } from "@/lib/data/discover";
import { loadFeed, newTrendingSeed } from "@/lib/data/posts";
import { loadSuggestions, loadTrendingTopics } from "@/lib/data/shell";
import { compact, relativeTime } from "@/lib/format";
import { getViewer } from "@/lib/viewer";

export const DISCOVER_TABS = [
  { key: "overview", label: "Overview", href: "/discover" },
  { key: "people", label: "People", href: "/discover/people" },
  { key: "organisations", label: "Organisations", href: "/discover/organisations" },
  { key: "topics", label: "Topics", href: "/discover/topics" },
] as const;
export type DiscoverTab = (typeof DISCOVER_TABS)[number]["key"];
export const isDiscoverTab = (value: unknown): value is DiscoverTab => DISCOVER_TABS.some((tab) => tab.key === value);

export function DiscoverView({ tab }: { tab: DiscoverTab }) {
  return (
    <>
      <PageHeader title="Discover">
        <form action="/search" className="mx-4 mb-3 flex items-center gap-2 rounded-full border border-rail bg-shell px-4 focus-within:border-primary sm:mx-6">
          <Search className="size-4 text-ink-muted" />
          <input name="q" dir="auto" placeholder="Search posts, people and organisations" aria-label="Search" className="h-10 w-full bg-transparent text-[15px] focus:outline-none" />
        </form>
        <Tabs tabs={DISCOVER_TABS.map(({ key, label, href }) => ({ href, label, active: key === tab }))} />
      </PageHeader>
      <DiscoverTabContent tab={tab} />
    </>
  );
}

// Suggestions are worked out for a member, so a visitor is asked to join
// rather than told there is no one here.
function JoinToSee({ what }: { what: string }) {
  return (
    <EmptyState title={`Join to see ${what}`} action={<ButtonLink href="/signup">Join Mavuno</ButtonLink>}>
      Suggestions come from your city, your interests and the people you follow.
    </EmptyState>
  );
}

async function DiscoverTabContent({ tab }: { tab: DiscoverTab }) {
  if ((tab === "people" || tab === "organisations") && !(await getViewer())) return <JoinToSee what={tab === "people" ? "people to follow" : "organisations"} />;
  switch (tab) {
    case "people": {
      const people = await loadSuggestions(30);
      return people.length ? people.map((person) => <PersonRow key={person.id} person={person} detail={person.reason} />) : <EmptyState title="No suggestions right now" />;
    }
    case "organisations": {
      const organisations = await loadSuggestedOrganisations(30);
      return organisations.length ? (
        organisations.map((org) => <PersonRow key={org.id} person={org} />)
      ) : (
        <EmptyState title="No organisations yet">Community groups, businesses and associations can join from Settings → Organisations.</EmptyState>
      );
    }
    case "topics": {
      const topics = await loadTrendingTopics(40);
      return topics.length ? <TopicList topics={topics} /> : <EmptyState title="No topics this week">Add a #hashtag to a post to start one.</EmptyState>;
    }
    case "overview":
      return <Overview />;
    default: {
      const exhaustive: never = tab;
      return exhaustive;
    }
  }
}

async function Overview() {
  const viewer = await getViewer();
  const [topics, spaces, people, organisations, trending] = await Promise.all([
    loadTrendingTopics(6),
    loadActiveSpaces(6),
    viewer ? loadSuggestions(4) : [],
    viewer ? loadSuggestedOrganisations(3) : [],
    loadFeed({ kind: "trending", seed: newTrendingSeed() }, null, { previews: false }),
  ]);

  return (
    <>
      {topics.length > 0 ? (
        <Section title="Talked about this week" meta={<Link href="/discover/topics" className="hover:text-primary">all topics</Link>}>
          <TopicList topics={topics} compact />
        </Section>
      ) : null}
      <Section title="Active spaces" meta={<Link href="/spaces" className="hover:text-primary">all spaces</Link>}>
        <ul className="grid gap-2 sm:grid-cols-2">
          {spaces.map((space) => (
            <li key={space.slug}>
              <Link href={`/spaces/${space.slug}`} className="flex items-center gap-3 rounded-lg border border-hairline px-3 py-2.5 hover:bg-wash">
                <SpaceAvatar photo={space.photo} emoji={space.emoji} />
                <span className="min-w-0">
                  <span className="block truncate text-[15px] font-medium">{space.name}</span>
                  <span className="block font-mono text-xs text-ink-muted">
                    {compact(space.members)} {space.members === 1 ? "member" : "members"}{space.lastPostAt ? ` · active ${relativeTime(space.lastPostAt)}` : ""}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </Section>
      {people.length > 0 ? (
        <Section title="People to follow" meta={<Link href="/discover/people" className="hover:text-primary">more</Link>} className="pb-2">
          {people.map((person) => (
            <PersonRow key={person.id} person={person} detail={person.reason} compact />
          ))}
        </Section>
      ) : null}
      {organisations.length > 0 ? (
        <Section title="Organisations" meta={<Link href="/discover/organisations" className="hover:text-primary">more</Link>} className="pb-2">
          {organisations.map((org) => (
            <PersonRow key={org.id} person={org} compact />
          ))}
        </Section>
      ) : null}
      <div className="flex items-baseline justify-between px-4 pt-5 pb-2 sm:px-6">
        <h2 className="text-lg font-semibold tracking-tight">Trending discussions</h2>
        <Link href="/trending" className="font-mono text-xs text-ink-muted hover:text-primary">all trending</Link>
      </div>
      {trending.posts.length ? trending.posts.slice(0, 8).map((row) => <PostItem key={row.id} row={row} />) : <EmptyState title="Quiet so far this week" />}
    </>
  );
}

function TopicList({ topics, compact: small = false }: { topics: { topic: string; posts: number; people: number }[]; compact?: boolean }) {
  return (
    <ol className={small ? "flex flex-wrap gap-2" : "divide-y divide-hairline"}>
      {topics.map((topic, index) =>
        small ? (
          <li key={topic.topic}>
            <Link href={`/topics/${topic.topic}`} className="inline-flex items-center rounded-full border border-hairline px-3 py-1 text-sm hover:bg-wash">
              #{topic.topic}
            </Link>
          </li>
        ) : (
          <li key={topic.topic}>
            <Link href={`/topics/${topic.topic}`} className="flex items-center gap-4 px-4 py-3 hover:bg-wash sm:px-6">
              <span className="w-6 font-mono text-sm text-ink-muted tabular">{index + 1}</span>
              <span className="min-w-0 flex-1">
                <span className="block font-medium">#{topic.topic}</span>
                <span className="font-mono text-xs text-ink-muted">
                  {compact(topic.people)} {topic.people === 1 ? "person" : "people"} · {compact(topic.posts)} posts this week
                </span>
              </span>
            </Link>
          </li>
        ),
      )}
    </ol>
  );
}
