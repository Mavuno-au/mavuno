import type { Metadata } from "next";
import { Plus } from "lucide-react";
import { FilterBar, FilterSelect } from "@/components/community/filters";
import { EventDays } from "@/components/community/rows";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState, PageHeader } from "@/components/ui/page";
import { EVENT_CATEGORIES } from "@/lib/catalogue";
import { eventCategorySchema, loadNearbyCityIds, loadUpcomingEvents, type EventScope } from "@/lib/data/community";
import { loadCities, type City } from "@/lib/data/shell";
import { getViewer, type Viewer } from "@/lib/viewer";
import { joinPath } from "@/lib/safe-redirect";

export const metadata: Metadata = { title: "Events" };

const NEARBY_KM = 80;

type Place = { kind: "anywhere" } | { kind: "online" } | { kind: "nearby"; cityId: number } | { kind: "city"; city: City };

function placeFrom(where: unknown, cities: City[], viewer: Viewer | null): Place {
  if (where === "online") return { kind: "online" };
  if (where === "nearby" && viewer?.cityId) return { kind: "nearby", cityId: viewer.cityId };
  const city = cities.find((item) => item.slug === where);
  return city ? { kind: "city", city } : { kind: "anywhere" };
}

async function scopeFor(place: Place): Promise<EventScope> {
  switch (place.kind) {
    case "anywhere":
      return { kind: "all" };
    case "online":
      return { kind: "online" };
    case "nearby":
      return { kind: "cities", cityIds: await loadNearbyCityIds(place.cityId, NEARBY_KM) };
    case "city":
      return { kind: "cities", cityIds: [place.city.id] };
    default: {
      const exhaustive: never = place;
      return exhaustive;
    }
  }
}

function placeValue(place: Place) {
  switch (place.kind) {
    case "anywhere":
      return "";
    case "online":
    case "nearby":
      return place.kind;
    case "city":
      return place.city.slug;
    default: {
      const exhaustive: never = place;
      return exhaustive;
    }
  }
}

export default async function EventsPage({ searchParams }: PageProps<"/events">) {
  const [viewer, cities, query] = await Promise.all([getViewer(), loadCities(), searchParams]);
  const place = placeFrom(query.where, cities, viewer);
  const category = eventCategorySchema.safeParse(query.category).data ?? null;
  const events = await loadUpcomingEvents(await scopeFor(place), category);

  const places = [
    { value: "", label: "Anywhere" },
    ...(viewer?.cityId ? [{ value: "nearby", label: `Near you (${NEARBY_KM} km)` }] : []),
    { value: "online", label: "Online" },
    ...cities.map((city) => ({ value: city.slug, label: `${city.name}, ${city.state}` })),
  ];

  return (
    <>
      <PageHeader
        title="Events"
        meta="Upcoming"
        actions={
          <ButtonLink href={viewer ? "/events/new" : joinPath("/events/new")} size="sm">
            <Plus /> Host an event
          </ButtonLink>
        }
      />
      <FilterBar>
        <FilterSelect name="where" label="Where" value={placeValue(place)} options={places} />
        <FilterSelect
          name="category"
          label="Category"
          value={category ?? ""}
          options={[{ value: "", label: "All categories" }, ...Object.entries(EVENT_CATEGORIES).map(([value, label]) => ({ value, label }))]}
        />
      </FilterBar>
      {events.length === 0 ? (
        <EmptyState title="No upcoming events here" action={<ButtonLink href={viewer ? "/events/new" : joinPath("/events/new")}>Host an event</ButtonLink>}>
          Try another place or category, or put something on yourself.
        </EmptyState>
      ) : (
        <EventDays events={events} />
      )}
    </>
  );
}
