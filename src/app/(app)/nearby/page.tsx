import type { Metadata } from "next";
import { Lock } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { FilterBar, FilterSelect } from "@/components/community/filters";
import { EventRow, SpaceRow } from "@/components/community/rows";
import { PersonRow } from "@/components/people/person-row";
import { Feed } from "@/components/post/feed";
import { EmptyState, PageHeader } from "@/components/ui/page";
import { INTERESTS } from "@/lib/catalogue";
import { loadCitySpace, loadNearbyEvents, loadNearbyPeople } from "@/lib/data/community";
import { loadFeed } from "@/lib/data/posts";
import { loadCities, type City } from "@/lib/data/shell";
import { getViewer, type Viewer } from "@/lib/viewer";

export const metadata: Metadata = { title: "Nearby" };

const RADII = [30, 80, 150] as const;
type Radius = (typeof RADII)[number];
const DEFAULT_RADIUS: Radius = 80;

const radiusFrom = (value: unknown): Radius => RADII.find((radius) => String(radius) === value) ?? DEFAULT_RADIUS;
const interestFrom = (value: unknown) => INTERESTS.find((interest) => interest === value) ?? null;

function Heading({ id, title, meta }: { id: string; title: string; meta?: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-hairline bg-shell px-4 py-2 sm:px-6">
      <h2 id={id} className="text-sm font-semibold">
        {title}
      </h2>
      {meta ? <span className="text-sm">{meta}</span> : null}
    </div>
  );
}

export default async function NearbyPage({ searchParams }: PageProps<"/nearby">) {
  const [viewer, cities, query] = await Promise.all([getViewer(), loadCities(), searchParams]);
  const city = cities.find((item) => item.slug === query.city) ?? cities.find((item) => item.id === viewer?.cityId) ?? null;
  const radius = radiusFrom(query.radius);
  const interest = interestFrom(query.interest);

  return (
    <>
      <PageHeader title="Nearby" meta={city ? `Around ${city.name}` : "Choose a city"} />
      <p className="flex gap-3 border-b border-hairline px-4 py-3 text-sm text-ink-muted sm:px-6">
        <Lock className="mt-0.5 size-4 shrink-0" />
        <span>
          Nearby only uses the city on each profile, never anyone's precise location. People who'd rather not appear here can turn it off in{" "}
          <Link href="/settings/privacy" className="text-primary hover:underline">
            Settings → Privacy
          </Link>
          .
        </span>
      </p>
      <FilterBar>
        <FilterSelect
          name="city"
          label="City"
          value={city?.slug ?? ""}
          options={[...(city ? [] : [{ value: "", label: "Choose a city" }]), ...cities.map((item) => ({ value: item.slug, label: `${item.name}, ${item.state}` }))]}
        />
        <FilterSelect
          name="radius"
          label="Distance"
          value={String(radius)}
          options={RADII.map((value) => ({ value: String(value), label: `Within ${value} km` }))}
          className="max-w-40"
        />
      </FilterBar>
      {city ? (
        <NearbySections city={city} radius={radius} interest={interest} viewer={viewer} />
      ) : (
        <EmptyState title="Where are you based?">
          Choose a city to see people, posts and events around it.
          {viewer ? (
            <>
              {" "}
              You can also{" "}
              <Link href="/settings" className="text-primary hover:underline">
                add your city to your profile
              </Link>
              .
            </>
          ) : null}
        </EmptyState>
      )}
    </>
  );
}

async function NearbySections({ city, radius, interest, viewer }: { city: City; radius: Radius; interest: string | null; viewer: Viewer | null }) {
  const [space, people, events, posts] = await Promise.all([
    loadCitySpace(city.id, viewer),
    loadNearbyPeople(city.id, radius, interest),
    loadNearbyEvents(city.id, radius, 5),
    loadFeed({ kind: "local", cityId: city.id, radiusKm: radius }),
  ]);
  const eventsHref = city.id === viewer?.cityId && radius === DEFAULT_RADIUS ? "/events?where=nearby" : `/events?where=${city.slug}`;

  return (
    <>
      {space ? (
        <section aria-labelledby="nearby-space">
          <Heading id="nearby-space" title={`The ${city.name} space`} />
          <SpaceRow space={space} />
        </section>
      ) : null}

      <section aria-labelledby="nearby-people">
        <Heading id="nearby-people" title="People nearby" />
        <FilterBar>
          <FilterSelect
            name="interest"
            label="Interest"
            value={interest ?? ""}
            options={[{ value: "", label: "Any interest" }, ...INTERESTS.map((value) => ({ value, label: value.charAt(0).toUpperCase() + value.slice(1) }))]}
            className="max-w-56"
          />
        </FilterBar>
        {people.length === 0 ? (
          <p className="border-b border-hairline px-4 py-6 text-center text-sm text-ink-muted sm:px-6">
            Nobody {interest ? `into ${interest} ` : ""}within {radius} km has shown up here yet.
          </p>
        ) : (
          people.map((person) => <PersonRow key={person.id} person={person} detail={[person.city, person.reason].filter(Boolean).join(" · ")} />)
        )}
      </section>

      <section aria-labelledby="nearby-events">
        <Heading
          id="nearby-events"
          title="Events nearby"
          meta={
            <Link href={eventsHref} className="text-primary hover:underline">
              See all
            </Link>
          }
        />
        {events.length === 0 ? (
          <p className="border-b border-hairline px-4 py-6 text-center text-sm text-ink-muted sm:px-6">No upcoming events within {radius} km.</p>
        ) : (
          events.map((event) => <EventRow key={event.id} event={event} withDate />)
        )}
      </section>

      <section aria-labelledby="nearby-posts">
        <Heading id="nearby-posts" title="Posts from nearby" meta={<span className="font-mono text-xs text-ink-muted">within {radius} km</span>} />
        <Feed
          key={`${city.id}:${radius}`}
          source={{ kind: "local", cityId: city.id, radiusKm: radius }}
          initial={posts.posts}
          previews={posts.previews}
          next={posts.next}
          empty={<EmptyState title="No posts nearby yet">Posts from members based within {radius} km of {city.name} show here.</EmptyState>}
        />
      </section>
    </>
  );
}
