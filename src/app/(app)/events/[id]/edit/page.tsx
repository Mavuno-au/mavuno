import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { EventForm } from "@/components/community/event-form";
import { PageHeader } from "@/components/ui/page";
import { loadEvent, loadSpaces, timezoneSchema, toZonedInput } from "@/lib/data/community";
import { loadCities } from "@/lib/data/shell";
import { requireViewer } from "@/lib/viewer";

export const metadata: Metadata = { title: "Edit event" };

export default async function EditEventPage({ params }: PageProps<"/events/[id]/edit">) {
  const { id } = await params;
  const viewer = await requireViewer(`/events/${id}/edit`);
  const [found, cities, spaces] = await Promise.all([loadEvent(id, viewer), loadCities(), loadSpaces("joined", viewer)]);
  const event = found?.event;
  if (!event || !(event.hostId === viewer.id || viewer.organisations.some((org) => org.id === event.hostId))) notFound();

  const timezone = timezoneSchema.catch("Australia/Sydney").parse(event.timezone);
  const draft = {
    title: event.title,
    description: event.description,
    category: event.category,
    format: event.format,
    timezone,
    startsAt: toZonedInput(event.startsAt, timezone),
    endsAt: event.endsAt ? toZonedInput(event.endsAt, timezone) : "",
    cityId: event.cityId,
    venue: event.venue ?? "",
    address: event.address ?? "",
    onlineUrl: event.onlineUrl ?? "",
    ticketUrl: event.ticketUrl ?? "",
    coverUrl: event.coverUrl,
    free: event.free,
    capacity: event.capacity,
    spaceId: event.spaceId,
  };

  return (
    <>
      <PageHeader title="Edit event" back={`/events/${event.id}`} meta={event.title} />
      <EventForm
        target={{ kind: "edit", eventId: event.id, hostId: event.hostId, draft }}
        cities={cities}
        spaces={[
          ...spaces.map(({ id: spaceId, name, emoji }) => ({ id: spaceId, name, emoji })),
          ...(event.spaceId && event.space && !spaces.some((space) => space.id === event.spaceId) ? [{ id: event.spaceId, ...event.space }] : []),
        ]}
      />
    </>
  );
}
