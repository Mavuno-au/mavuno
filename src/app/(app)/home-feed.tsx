import Link from "next/link";
import { HomeComposer } from "@/components/post/home-composer";
import { Feed } from "@/components/post/feed";
import { PersonRow } from "@/components/people/person-row";
import { JsonLd } from "@/components/seo/json-ld";
import { WhoToFollow } from "@/components/people/who-to-follow";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState, PageHeader, Tabs } from "@/components/ui/page";
import { loadFeed } from "@/lib/data/posts";
import { loadSuggestions, loadWhoToFollowBlock } from "@/lib/data/shell";
import type { HomeFeed } from "@/lib/feeds";
import { siteJsonLd } from "@/lib/structured-data";
import { getViewer } from "@/lib/viewer";

const FEEDS: Record<HomeFeed, { label: string; href: string }> = {
  following: { label: "Following", href: "/" },
  latest: { label: "Latest", href: "/latest" },
  trending: { label: "Trending", href: "/trending" },
};

export async function HomeFeedView({ feed }: { feed: HomeFeed }) {
  const viewer = await getViewer();
  const feeds: HomeFeed[] = viewer ? ["following", "latest", "trending"] : ["trending", "latest"];
  const [page, whoToFollow] = await Promise.all([loadFeed({ kind: feed }), feed === "trending" ? Promise.resolve(null) : loadWhoToFollowBlock(viewer)]);
  // An empty Following feed lists people to follow instead.
  const suggestions = viewer && feed === "following" && page.posts.length === 0 ? await loadSuggestions(5) : [];
  // Wide screens show suggestions in the side column; narrower ones get them after the fifth post.
  const inline =
    whoToFollow?.kind === "page"
      ? { after: 5, node: <WhoToFollow initial={whoToFollow.page} className="border-b border-hairline px-4 py-3 sm:px-6 xl:hidden" /> }
      : undefined;

  return (
    <>
      <JsonLd data={siteJsonLd()} />
      <PageHeader title="Home">
        <Tabs tabs={feeds.map((item) => ({ href: FEEDS[item].href, label: FEEDS[item].label, active: item === feed }))} />
      </PageHeader>
      {viewer ? (
        <HomeComposer />
      ) : (
        <section className="border-b border-hairline px-4 py-6 sm:px-6">
          <h2 className="text-2xl font-semibold tracking-tight">The social network for African Australians</h2>
          <p className="mt-2 text-[15px] text-ink-muted">
            Follow people and organisations, join your city's space, and find events, jobs, scholarships and mentors from the community.
          </p>
          <div className="mt-4 flex gap-2">
            <ButtonLink href="/signup">Join Mavuno</ButtonLink>
            <ButtonLink href="/login" variant="outline">Sign in</ButtonLink>
          </div>
        </section>
      )}
      <Feed
        key={feed}
        source={{ kind: feed }}
        initial={page.posts}
        next={page.next}
        dayMarkers={feed !== "trending"}
        insert={inline}
        empty={
          feed === "following" ? (
            <div>
              <EmptyState title="Your feed is quiet">
                Follow people and organisations to see their posts here, or browse <Link href="/latest" className="text-primary hover:underline">the latest posts</Link>.
              </EmptyState>
              {suggestions.map((person) => (
                <PersonRow key={person.id} person={person} detail={person.reason} />
              ))}
            </div>
          ) : (
            <EmptyState title="Nothing here yet">Be the first to post something.</EmptyState>
          )
        }
      />
    </>
  );
}
