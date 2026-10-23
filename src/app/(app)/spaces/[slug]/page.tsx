import type { Metadata } from "next";
import { BadgeCheck } from "lucide-react";
import { notFound } from "next/navigation";
import { PhotoBanner, SpaceAvatar } from "@/components/community/city-photo";
import { JoinButton } from "@/components/community/join-button";
import { ReportButton } from "@/components/community/report-button";
import { EventRow } from "@/components/community/rows";
import { SpaceComposer } from "@/components/community/space-composer";
import { Feed } from "@/components/post/feed";
import { JsonLd } from "@/components/seo/json-ld";
import { EmptyState, PageHeader } from "@/components/ui/page";
import { loadSpace, loadUpcomingEvents, type SpaceRole } from "@/lib/data/community";
import { loadFeed } from "@/lib/data/posts";
import { count } from "@/lib/format";
import { breadcrumbJsonLd } from "@/lib/structured-data";
import { getViewer } from "@/lib/viewer";

const ROLES: Record<SpaceRole, string> = { owner: "You started this space", moderator: "You moderate this space", member: "You're a member" };

export async function generateMetadata({ params }: PageProps<"/spaces/[slug]">): Promise<Metadata> {
  const found = await loadSpace((await params).slug, await getViewer());
  if (!found) return { title: "Space" };
  const { space } = found;
  // City spaces are titled the way people search for them.
  const city = space.kind === "city";
  return {
    title: city ? `African communities in ${space.name}` : space.name,
    description:
      space.description ||
      (city ? `Events, jobs and recommendations from African communities in ${space.name}, posted by people who live there.` : `${space.name} on Mavuno, the social network for African Australians.`),
    alternates: { canonical: `/spaces/${space.slug}`, types: { "application/atom+xml": [{ url: `/spaces/${space.slug}/feed.xml`, title: `Posts in ${space.name}` }] } },
  };
}

export default async function SpacePage({ params }: PageProps<"/spaces/[slug]">) {
  const viewer = await getViewer();
  const found = await loadSpace((await params).slug, viewer);
  if (!found) notFound();
  const { space, role } = found;
  const [page, events] = await Promise.all([loadFeed({ kind: "space", spaceId: space.id }), loadUpcomingEvents({ kind: "space", spaceId: space.id }, null, 3)]);

  return (
    <>
      <JsonLd data={breadcrumbJsonLd([{ name: "Spaces", path: "/spaces" }, { name: space.name }])} />
      <PageHeader title={space.name} back="/spaces" meta={count(space.members, "member")} />
      {space.photo ? <PhotoBanner photo={space.photo} name={space.name} /> : null}
      <section className="border-b border-hairline px-4 py-5 sm:px-6">
        <div className="flex items-start gap-4">
          <SpaceAvatar photo={space.photo} emoji={space.emoji} size="md" />
          <div className="min-w-0 flex-1">
            <h2 className="flex items-center gap-1.5 text-xl font-semibold tracking-tight">
              <span className="truncate">{space.name}</span>
              {space.official ? <BadgeCheck className="size-5 shrink-0 text-primary" aria-label="Official space" /> : null}
            </h2>
            <p className="font-mono text-xs text-ink-muted">
              {count(space.members, "member")} · {count(space.posts, "post")}
            </p>
            {role ? <p className="mt-0.5 text-sm text-ink-muted">{ROLES[role]}</p> : null}
          </div>
          {role === "owner" ? null : <JoinButton spaceId={space.id} joined={role !== null} />}
        </div>
        {space.description ? <p className="mt-3 text-[15px] whitespace-pre-wrap wrap-anywhere">{space.description}</p> : null}
        {space.official || role === "owner" ? null : (
          <div className="mt-2 -ml-3">
            <ReportButton target={{ targetType: "space", targetId: space.id }} what="space" />
          </div>
        )}
      </section>

      {role ? <SpaceComposer spaceId={space.id} spaceName={space.name} /> : null}

      {events.length > 0 ? (
        <section aria-labelledby="space-events">
          <h2 id="space-events" className="border-b border-hairline bg-shell px-4 py-2 text-sm font-semibold sm:px-6">
            Upcoming events in this space
          </h2>
          {events.map((event) => (
            <EventRow key={event.id} event={event} withDate />
          ))}
        </section>
      ) : null}

      <Feed
        key={space.id}
        source={{ kind: "space", spaceId: space.id }}
        initial={page.posts}
        previews={page.previews}
        next={page.next}
        empty={<EmptyState title="No posts yet">{role ? "Start the conversation. Your post shows here and on your profile." : "Join the space to start the conversation."}</EmptyState>}
      />
    </>
  );
}
