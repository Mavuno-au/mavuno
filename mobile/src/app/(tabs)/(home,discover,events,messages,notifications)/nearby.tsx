import { MapPin } from "lucide-react-native";
import { useEffect, useState } from "react";
import { View } from "react-native";
import { INTEREST_CHOICES } from "@/lib/choices";
import type { CommunityEvent } from "@/lib/community";
import type { PersonSummary } from "@/lib/domain";
import { loadCitySpace, loadNearbyCityIds, loadNearbyPeople, loadUpcomingEvents, type SpaceListItem } from "@/data/community";
import { loadFeed } from "@/data/posts";
import { loadCities, type City } from "@/data/profiles";
import { useViewer } from "@/data/session";
import { useFeed } from "@/data/use-feed";
import { EventRow } from "@/community/event-row";
import { SpaceRow } from "@/community/space-card";
import { PersonRow } from "@/people/person-row";
import { FeedList } from "@/post/feed-list";
import { EmptyState, Segmented } from "@/ui/controls";
import { Group, SelectRow } from "@/ui/form";
import { BackButton, Header } from "@/ui/header";
import { font, Text } from "@/ui/text";
import { usePalette } from "@/ui/theme";

const RADII = [30, 80, 150] as const;
type Radius = (typeof RADII)[number];

// The website's Nearby: a city, a distance and an interest, then people,
// events and posts. Distances are between cities; nobody's exact location is stored.
export default function Nearby() {
  const palette = usePalette();
  const viewer = useViewer();
  const [cities, setCities] = useState<City[]>([]);
  const [cityId, setCityId] = useState<number | null>(viewer?.cityId ?? null);
  const [radius, setRadius] = useState<Radius>(80);
  const [interest, setInterest] = useState<string>("");
  const [around, setAround] = useState<{ key: string; space: SpaceListItem | null; people: PersonSummary[]; events: CommunityEvent[] } | null>(null);
  const viewerId = viewer?.id ?? null;
  const key = `${cityId ?? ""}:${radius}:${interest}`;

  useEffect(() => {
    void loadCities()
      .then(setCities)
      .catch(() => setCities([]));
  }, []);

  useEffect(() => {
    if (!cityId || !viewerId) return;
    let current = true;
    void Promise.all([
      loadCitySpace(cityId, viewerId).catch(() => null),
      loadNearbyPeople(cityId, radius, interest || null).catch(() => []),
      loadNearbyCityIds(cityId, radius).then((ids) => loadUpcomingEvents({ kind: "cities", cityIds: ids }, null, 5)).catch(() => []),
    ]).then(([space, people, events]) => {
      if (current) setAround({ key, space, people, events });
    });
    return () => {
      current = false;
    };
  }, [cityId, radius, interest, viewerId, key]);

  const feed = useFeed((cursor) => loadFeed({ kind: "local", cityId: cityId ?? 1, radiusKm: radius }, cursor), `local:${cityId ?? ""}:${radius}`, { enabled: cityId !== null });
  const shown = around?.key === key ? around : null;
  const heading = (text: string) => (
    <Text variant="small" tone="muted" accessibilityRole="header" style={{ fontFamily: font.semibold, paddingHorizontal: 16, paddingTop: 16, paddingBottom: 4, textTransform: "uppercase", letterSpacing: 0.5 }}>
      {text}
    </Text>
  );

  const header = (
    <View>
      <View style={{ padding: 16, gap: 12 }}>
        <Group>
          <SelectRow label="City" options={cities.map((city) => ({ value: city.id, label: `${city.name}, ${city.state}` }))} value={cityId} onChange={setCityId} />
          <SelectRow label="Interest" options={[{ value: "", label: "Any interest" }, ...INTEREST_CHOICES]} value={interest} onChange={setInterest} last />
        </Group>
        <Segmented label="Distance" options={RADII.map((value) => ({ key: String(value), label: `${value} km` }))} value={String(radius)} onChange={(value) => setRadius(RADII.find((option) => String(option) === value) ?? 80)} />
      </View>
      {shown?.space ? (
        <>
          {heading("City space")}
          <SpaceRow space={shown.space} />
        </>
      ) : null}
      {shown && shown.people.length > 0 ? (
        <>
          {heading("People nearby")}
          {shown.people.slice(0, 6).map((person) => (
            <PersonRow key={person.id} person={person} detail={[person.city, person.reason].filter(Boolean).join(" · ") || undefined} />
          ))}
        </>
      ) : null}
      {shown && shown.events.length > 0 ? (
        <>
          {heading("Events nearby")}
          {shown.events.map((event) => (
            <EventRow key={event.id} event={event} />
          ))}
        </>
      ) : null}
      {cityId ? heading("Posts nearby") : null}
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: palette.surface }}>
      <Header title="Nearby" left={<BackButton fallback="/discover" />} />
      {cityId ? (
        <FeedList feed={feed} header={header} end="That's everything nearby." empty={<EmptyState title="Nothing nearby yet">Try a longer distance.</EmptyState>} />
      ) : (
        <View style={{ flex: 1 }}>
          {header}
          <EmptyState icon={<MapPin size={26} color={palette.inkMuted} />} title="Choose a city">
            Nearby shows people, events and posts around a city you choose. Only cities are used, never your location.
          </EmptyState>
        </View>
      )}
    </View>
  );
}
