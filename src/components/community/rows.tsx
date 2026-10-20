import { BadgeCheck, Globe, MapPin } from "lucide-react";
import Link from "next/link";
import { Fragment } from "react";
import { SpaceAvatar } from "@/components/community/city-photo";
import { JoinButton } from "@/components/community/join-button";
import { Avatar } from "@/components/ui/avatar";
import { Chip } from "@/components/ui/page";
import { EVENT_CATEGORIES, OPPORTUNITY_TYPES } from "@/lib/catalogue";
import { DEADLINE_ZONE, type CommunityEvent, type Opportunity, type Review, type SpaceListItem } from "@/lib/data/community";
import { compact, count, eventDate, relativeTime } from "@/lib/format";

const DAY = 24 * 60 * 60 * 1000;

const dayKey = (instant: number, timeZone: string) => new Date(instant).toLocaleDateString("en-CA", { timeZone });

function dayHeading(iso: string, timeZone: string) {
  const key = dayKey(Date.parse(iso), timeZone);
  if (key === dayKey(Date.now(), timeZone)) return "Today";
  if (key === dayKey(Date.now() + DAY, timeZone)) return "Tomorrow";
  return new Date(iso).toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long", timeZone });
}

const eventTime = (iso: string, timeZone: string) => new Date(iso).toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit", timeZone, timeZoneName: "short" });

// Start and end in the event's own time zone; the end shows only its time when it is on the same day.
export function eventWhen(event: Pick<CommunityEvent, "startsAt" | "endsAt" | "timezone">) {
  const start = eventDate(event.startsAt, event.timezone);
  if (!event.endsAt) return start;
  const sameDay = dayKey(Date.parse(event.startsAt), event.timezone) === dayKey(Date.parse(event.endsAt), event.timezone);
  return `${start} to ${sameDay ? eventTime(event.endsAt, event.timezone) : eventDate(event.endsAt, event.timezone)}`;
}

export function eventPlace(event: Pick<CommunityEvent, "format" | "venue" | "city">) {
  const physical = [event.venue, event.city].filter(Boolean).join(", ");
  switch (event.format) {
    case "online":
      return "Online";
    case "in_person":
      return physical;
    case "hybrid":
      return physical ? `${physical} and online` : "Online";
    default: {
      const exhaustive: never = event.format;
      return exhaustive;
    }
  }
}

export function EventRow({ event, withDate = false }: { event: CommunityEvent; withDate?: boolean }) {
  return (
    <Link href={`/events/${event.id}`} className="flex gap-3 border-b border-hairline px-4 py-3 transition-colors hover:bg-wash sm:px-6">
      <div className="min-w-0 flex-1">
        <p className="font-mono text-xs text-ink-muted">
          {withDate ? eventDate(event.startsAt, event.timezone) : eventTime(event.startsAt, event.timezone)} · {EVENT_CATEGORIES[event.category]}
        </p>
        <p className="mt-0.5 truncate font-medium">{event.title}</p>
        <p className="flex items-center gap-1 truncate text-sm text-ink-muted">
          {event.format === "online" ? <Globe className="size-3.5 shrink-0" /> : <MapPin className="size-3.5 shrink-0" />}
          <span className="truncate">{eventPlace(event)}</span>
        </p>
        <p className="mt-1 flex items-center gap-2 text-sm text-ink-muted">
          <Avatar person={event.host} size="xs" />
          <span className="truncate">{event.host.displayName}</span>
          {event.going > 0 ? <span className="shrink-0 font-mono text-xs">· {compact(event.going)} going</span> : null}
          {event.free ? <span className="shrink-0 font-mono text-xs">· Free</span> : null}
        </p>
      </div>
      {event.coverUrl ? <img src={event.coverUrl} alt="" loading="lazy" className="size-16 shrink-0 rounded-md bg-wash object-cover sm:size-20" /> : null}
    </Link>
  );
}

export function EventDays({ events }: { events: CommunityEvent[] }) {
  return events.map((event, index) => {
    const heading = dayHeading(event.startsAt, event.timezone);
    const previous = events[index - 1];
    const fresh = !previous || dayHeading(previous.startsAt, previous.timezone) !== heading;
    return (
      <Fragment key={event.id}>
        {fresh ? <h2 className="border-b border-hairline bg-shell px-4 py-2 text-sm font-semibold sm:px-6">{heading}</h2> : null}
        <EventRow event={event} />
      </Fragment>
    );
  });
}

export const deadlineLabel = (iso: string) => new Date(iso).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric", timeZone: DEADLINE_ZONE });

export function opportunityPlace(opportunity: Pick<Opportunity, "remote" | "city" | "location">) {
  const place = [opportunity.location, opportunity.city].filter(Boolean).join(", ");
  if (!opportunity.remote) return place || "Australia";
  return place ? `${place} or remote` : "Remote";
}

export function OpportunityRow({ opportunity }: { opportunity: Opportunity }) {
  return (
    <Link href={`/opportunities/${opportunity.id}`} className="flex gap-3 border-b border-hairline px-4 py-3 transition-colors hover:bg-wash sm:px-6">
      <Avatar person={opportunity.poster} />
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{opportunity.title}</p>
        <p className="truncate text-sm text-ink-muted">
          {opportunity.organisation ?? opportunity.poster.displayName} · {opportunityPlace(opportunity)}
        </p>
        <p className="mt-1 flex min-w-0 items-center gap-2">
          <Chip tone="primary">{OPPORTUNITY_TYPES[opportunity.type].label}</Chip>
          {opportunity.deadlineAt ? <span className="shrink-0 font-mono text-xs text-ink-muted">Apply by {deadlineLabel(opportunity.deadlineAt)}</span> : null}
          {opportunity.compensation ? <span className="truncate font-mono text-xs text-ink-muted">{opportunity.compensation}</span> : null}
        </p>
      </div>
    </Link>
  );
}

export function SpaceRow({ space }: { space: SpaceListItem }) {
  return (
    <div className="flex items-center gap-3 border-b border-hairline px-4 py-3 sm:px-6">
      <Link href={`/spaces/${space.slug}`} className="flex min-w-0 flex-1 items-center gap-3">
        <SpaceAvatar photo={space.photo} emoji={space.emoji} />
        <span className="grid min-w-0">
          <span className="flex min-w-0 items-center gap-1">
            <span className="truncate font-medium hover:underline">{space.name}</span>
            {space.official ? <BadgeCheck className="size-4 shrink-0 text-primary" aria-label="Official space" /> : null}
          </span>
          <span className="truncate font-mono text-xs text-ink-muted">
            {count(space.members, "member")}
            {space.lastPostAt ? ` · active ${relativeTime(space.lastPostAt)}` : " · no posts yet"}
          </span>
        </span>
      </Link>
      <JoinButton spaceId={space.id} joined={space.joined} />
    </div>
  );
}

export function ReviewBanner({ review, what }: { review: Review; what: string }) {
  switch (review.kind) {
    case "published":
      return null;
    case "pending":
      return (
        <div role="status" className="border-b border-hairline bg-primary-soft px-4 py-3 text-sm sm:px-6">
          <p className="font-medium">Sent for review</p>
          <p className="text-ink-muted">A moderator checks listings from new members, usually within a day. Until then only its hosts can see this {what}.</p>
        </div>
      );
    case "rejected":
      return (
        <div role="status" className="border-b border-hairline bg-destructive-soft px-4 py-3 text-sm sm:px-6">
          <p className="font-medium text-destructive">This {what} wasn't approved</p>
          <p className="text-ink-muted">{review.reason ?? "It doesn't meet the community rules."} Only its hosts can see it.</p>
        </div>
      );
    default: {
      const exhaustive: never = review;
      return exhaustive;
    }
  }
}
