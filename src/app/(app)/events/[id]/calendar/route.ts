import { eventPlace } from "@/components/community/rows";
import { calendarFile, calendarFileName } from "@/lib/calendar";
import { loadEvent } from "@/lib/data/community";
import { absoluteUrl } from "@/lib/structured-data";

// A real file rather than one made in the browser: iPhones ignore downloads of
// a page-made file, but open a served one straight into Calendar.
export async function GET(_request: Request, { params }: RouteContext<"/events/[id]/calendar">) {
  const found = await loadEvent((await params).id, null);
  if (!found || found.event.review.kind !== "published" || found.event.cancelled) return new Response("Not found", { status: 404 });
  const { event } = found;
  const place = [eventPlace(event), event.address].filter(Boolean).join(", ");
  const body = calendarFile(
    { id: event.id, title: event.title, description: event.description, startsAt: event.startsAt, endsAt: event.endsAt, place },
    absoluteUrl(`/events/${event.id}`),
  );
  return new Response(body, {
    headers: {
      "content-type": "text/calendar; charset=utf-8",
      "content-disposition": `inline; filename="${calendarFileName(event.title)}"`,
      "cache-control": "public, max-age=300",
    },
  });
}
