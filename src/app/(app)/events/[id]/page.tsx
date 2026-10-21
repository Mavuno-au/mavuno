import type { Metadata } from "next";
import { BadgeCheck, CalendarDays, Globe, MapPin, Ticket, Users } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarLink } from "@/components/community/calendar-link";
import { ListingControls } from "@/components/community/listing-controls";
import { eventPlace, eventWhen, ReviewBanner } from "@/components/community/rows";
import { RsvpButtons } from "@/components/community/rsvp";
import { RichText } from "@/components/post/rich-text";
import { Avatar } from "@/components/ui/avatar";
import { EVENT_CATEGORIES } from "@/lib/catalogue";
import { JsonLd } from "@/components/seo/json-ld";
import { PageHeader } from "@/components/ui/page";
import { loadEvent, type CommunityEvent } from "@/lib/data/community";
import { breadcrumbJsonLd, eventJsonLd } from "@/lib/structured-data";
import { displayUrl } from "@/lib/text";
import { getViewer, type Viewer } from "@/lib/viewer";

const SIX_HOURS = 6 * 60 * 60 * 1000;

const actsAs = (viewer: Viewer | null, profileId: string) => viewer !== null && (viewer.id === profileId || viewer.organisations.some((org) => org.id === profileId));

const hasEnded = (event: CommunityEvent) => (event.endsAt ? Date.parse(event.endsAt) : Date.parse(event.startsAt) + SIX_HOURS) < Date.now();

export async function generateMetadata({ params }: PageProps<"/events/[id]">): Promise<Metadata> {
  const found = await loadEvent((await params).id, await getViewer());
  return {
    title: found?.event.title ?? "Event",
    description: found?.event.description.slice(0, 160) || undefined,
    alternates: found ? { canonical: `/events/${found.event.id}` } : undefined,
  };
}

export default async function EventPage({ params }: PageProps<"/events/[id]">) {
  const viewer = await getViewer();
  const found = await loadEvent((await params).id, viewer);
  if (!found) notFound();
  const { event, attendees, myRsvp } = found;
  const ended = hasEnded(event);
  const host = actsAs(viewer, event.hostId);
  const place = eventPlace(event);
  const showLink = event.onlineUrl !== null && (host || myRsvp === "going");

  return (
    <>
      {/* Search engines only list events with a place people can go to. */}
      {event.review.kind === "published" && event.format !== "online" ? <JsonLd data={eventJsonLd(event)} /> : null}
      {event.review.kind === "published" ? <JsonLd data={breadcrumbJsonLd([{ name: "Events", path: "/events" }, { name: event.title }])} /> : null}
      <PageHeader title="Event" back="/events" meta={EVENT_CATEGORIES[event.category]} />
      <ReviewBanner review={event.review} what="event" />
      {event.cancelled ? (
        <p role="status" className="border-b border-hairline bg-destructive-soft px-4 py-3 text-sm font-medium text-destructive sm:px-6">
          This event was cancelled.
        </p>
      ) : null}
      {event.coverUrl ? <img src={event.coverUrl} alt="" className="aspect-[2/1] w-full border-b border-hairline bg-wash object-cover" /> : null}

      <section className="grid gap-5 border-b border-hairline px-4 py-5 sm:px-6">
        <div>
          <p className="font-mono text-xs text-ink-muted">
            {EVENT_CATEGORIES[event.category]} · {event.free ? "Free" : "Paid"}
          </p>
          <h2 className="mt-1 text-2xl font-semibold tracking-tight wrap-anywhere">{event.title}</h2>
        </div>

        <ul className="grid gap-2.5 text-[15px] [&_svg]:mt-0.5 [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-ink-muted">
          <li className="flex gap-3">
            <CalendarDays />
            <span>{eventWhen(event)}</span>
          </li>
          <li className="flex gap-3">
            {event.format === "online" ? <Globe /> : <MapPin />}
            <span className="grid">
              <span>{place}</span>
              {event.address ? <span className="text-sm text-ink-muted">{event.address}</span> : null}
            </span>
          </li>
          {event.format !== "in_person" ? (
            <li className="flex gap-3">
              <Globe />
              {showLink && event.onlineUrl ? (
                <a href={event.onlineUrl} target="_blank" rel="noopener noreferrer nofollow" className="truncate text-primary hover:underline">
                  {displayUrl(event.onlineUrl)}
                </a>
              ) : (
                <span className="text-ink-muted">The online link shows here once you're going.</span>
              )}
            </li>
          ) : null}
          {event.ticketUrl ? (
            <li className="flex gap-3">
              <Ticket />
              <a href={event.ticketUrl} target="_blank" rel="noopener noreferrer nofollow" className="truncate text-primary hover:underline">
                Tickets and registration
              </a>
            </li>
          ) : null}
          {event.space ? (
            <li className="flex gap-3">
              <Users />
              <Link href={`/spaces/${event.space.slug}`} className="truncate hover:underline">
                {event.space.emoji ? `${event.space.emoji} ` : ""}
                {event.space.name}
              </Link>
            </li>
          ) : null}
        </ul>

        <Link href={`/@${event.host.username}`} className="-mx-2 flex items-center gap-3 rounded-lg p-2 hover:bg-wash">
          <Avatar person={event.host} />
          <span className="grid min-w-0">
            <span className="text-xs text-ink-muted">Hosted by</span>
            <span className="flex min-w-0 items-center gap-1">
              <span className="truncate font-semibold">{event.host.displayName}</span>
              {event.host.verified ? <BadgeCheck className="size-4 shrink-0 text-primary" aria-label="Verified organisation" /> : null}
            </span>
            <span className="truncate font-mono text-xs text-ink-muted">@{event.host.username}</span>
          </span>
        </Link>

        {event.review.kind === "published" && !event.cancelled && !ended ? (
          <RsvpButtons eventId={event.id} mine={myRsvp} going={event.going} capacity={event.capacity} />
        ) : ended && !event.cancelled ? (
          <p className="text-sm text-ink-muted">This event has ended.</p>
        ) : null}

        {event.going + event.interested > 0 ? (
          <div className="flex items-center gap-3">
            {attendees.length > 0 ? (
              <div className="flex -space-x-2">
                {attendees.map((person) => (
                  <Link key={person.id} href={`/@${person.username}`} title={person.displayName} className="rounded-full ring-2 ring-surface">
                    <Avatar person={person} size="sm" />
                  </Link>
                ))}
              </div>
            ) : null}
            <p className="font-mono text-xs text-ink-muted">
              {event.going} going · {event.interested} interested
            </p>
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          {!event.cancelled && !ended ? (
            <CalendarLink event={{ id: event.id, title: event.title, description: event.description, startsAt: event.startsAt, endsAt: event.endsAt, place: [place, event.address].filter(Boolean).join(", ") }} />
          ) : null}
          <ListingControls kind="event" id={event.id} ownerId={event.hostId} published={event.review.kind === "published"} ended={event.cancelled || ended} />
        </div>
      </section>

      {event.description ? (
        <section aria-label="About this event" className="border-b border-hairline px-4 py-5 sm:px-6">
          <RichText body={event.description} className="text-[15px] leading-relaxed" />
        </section>
      ) : null}
    </>
  );
}
