import type { Metadata } from "next";
import { Search } from "lucide-react";
import { PersonRow } from "@/components/people/person-row";
import { Feed } from "@/components/post/feed";
import { EmptyState, PageHeader, Tabs } from "@/components/ui/page";
import { searchPeople } from "@/lib/data/discover";
import { loadFeed } from "@/lib/data/posts";
import { withFollowing } from "@/lib/data/profiles";
import { getViewer } from "@/lib/viewer";

// Search results are endless near-duplicates of the pages they link to.
export const metadata: Metadata = { title: "Search", robots: { index: false, follow: true } };

export default async function SearchPage({ searchParams }: PageProps<"/search">) {
  const params = await searchParams;
  const query = typeof params.q === "string" ? params.q.trim().slice(0, 100) : "";
  const tab = params.tab === "people" ? "people" : "posts";
  const encoded = encodeURIComponent(query);

  return (
    <>
      <PageHeader title="Search" back="/discover">
        <form action="/search" className="mx-4 mb-3 flex items-center gap-2 rounded-full border border-rail bg-shell px-4 focus-within:border-primary sm:mx-6">
          <Search className="size-4 text-ink-muted" />
          <input name="q" defaultValue={query} autoFocus={!query} placeholder="Search posts, people and organisations" aria-label="Search" className="h-10 w-full bg-transparent text-[15px] focus:outline-none" />
          {tab === "people" ? <input type="hidden" name="tab" value="people" /> : null}
        </form>
        {query ? (
          <Tabs
            tabs={[
              { href: `/search?q=${encoded}`, label: "Posts", active: tab === "posts" },
              { href: `/search?q=${encoded}&tab=people`, label: "People and organisations", active: tab === "people" },
            ]}
          />
        ) : null}
      </PageHeader>
      {!query ? <EmptyState title="Search Mavuno">Find posts by the words in them, and people or organisations by name or @username.</EmptyState> : tab === "people" ? <PeopleResults query={query} /> : <PostResults query={query} />}
    </>
  );
}

async function PeopleResults({ query }: { query: string }) {
  const people = await withFollowing(await searchPeople(query), await getViewer());
  if (people.length === 0) return <EmptyState title={`No one matches “${query}”`}>Try a different spelling or their @username.</EmptyState>;
  return people.map((person) => <PersonRow key={person.id} person={person} />);
}

async function PostResults({ query }: { query: string }) {
  if (query.length < 3) return <EmptyState title="Type at least 3 characters to search posts" />;
  const source = { kind: "search" as const, query };
  const page = await loadFeed(source);
  return <Feed source={source} initial={page.posts} previews={page.previews} next={page.next} dayMarkers={false} end="No more results." empty={<EmptyState title={`No posts match “${query}”`}>Try fewer or different words.</EmptyState>} />;
}
