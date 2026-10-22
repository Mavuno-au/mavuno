import { router, useIsFocused } from "expo-router";
import { CalendarDays, Plus } from "lucide-react-native";
import { useCallback, useEffect, useState } from "react";
import { RefreshControl, SectionList, View } from "react-native";
import { EVENT_CATEGORIES, type EventCategory } from "@/lib/catalogue";
import type { CommunityEvent, EventScope, RsvpStatus } from "@/lib/community";
import { dayLabel } from "@/lib/format";
import { PROBLEM, reasonOf, type Reason } from "@/data/errors";
import { loadMyRsvps, loadNearbyCityIds, loadUpcomingEvents } from "@/data/community";
import { loadCities, type City } from "@/data/profiles";
import { useViewer } from "@/data/session";
import { EventRow } from "@/community/event-row";
import { Button, EmptyState, FeedSkeleton, IconButton } from "@/ui/controls";
import { Group, SelectRow } from "@/ui/form";
import { Header } from "@/ui/header";
import { font, Text } from "@/ui/text";
import { usePalette } from "@/ui/theme";
import { onSoftReset } from "@/util/events";
import { timeZone } from "@/util/time";

// Where to look, as the website's Events filter: anywhere, online, near the
// member's city, or a city.
type Where = "anywhere" | "online" | "nearby" | `city:${number}`;
type State = { kind: "loading" } | { kind: "failed"; reason: Reason } | { kind: "ready"; events: CommunityEvent[]; rsvps: Map<string, RsvpStatus>; refreshing: boolean };

export default function Events() {
  const palette = usePalette();
  const viewer = useViewer();
  const focused = useIsFocused();
  const [where, setWhere] = useState<Where>("anywhere");
  const [category, setCategory] = useState<EventCategory | "">("");
  const [cities, setCities] = useState<City[]>([]);
  const [state, setState] = useState<{ key: string; state: State } | null>(null);
  const key = `${where}:${category}`;
  const viewerId = viewer?.id ?? null;
  const viewerCity = viewer?.cityId ?? null;

  useEffect(() => {
    void loadCities()
      .then(setCities)
      .catch(() => setCities([]));
  }, []);

  const read = useCallback(
    (forKey: string) => {
      if (!viewerId) return;
      const scope = async (): Promise<EventScope> => {
        if (where === "online") return { kind: "online" };
        if (where === "nearby") return viewerCity ? { kind: "cities", cityIds: await loadNearbyCityIds(viewerCity, 80) } : { kind: "all" };
        if (where.startsWith("city:")) return { kind: "cities", cityIds: [Number(where.slice(5))] };
        return { kind: "all" };
      };
      scope()
        .then((chosen) => loadUpcomingEvents(chosen, category || null, 100))
        .then(async (events) => ({ events, rsvps: await loadMyRsvps(viewerId, events.map((event) => event.id)).catch(() => new Map<string, RsvpStatus>()) }))
        .then(
          ({ events, rsvps }) => setState({ key: forKey, state: { kind: "ready", events, rsvps, refreshing: false } }),
          (error: unknown) => setState({ key: forKey, state: { kind: "failed", reason: reasonOf(error) } }),
        );
    },
    [viewerId, viewerCity, where, category],
  );

  useEffect(() => read(key), [read, key]);
  useEffect(() => (focused ? onSoftReset(() => read(key)) : undefined), [focused, read, key]);

  const shown: State = state?.key === key ? state.state : { kind: "loading" };
  // Grouped by day in the reader's time zone, as on the website.
  const sections = shown.kind === "ready" ? groupByDay(shown.events) : [];
  const whereOptions: { value: Where; label: string }[] = [
    { value: "anywhere", label: "Anywhere" },
    { value: "online", label: "Online" },
    ...(viewerCity ? [{ value: "nearby" as const, label: "Near me (80 km)" }] : []),
    ...cities.map((city) => ({ value: `city:${city.id}` as const, label: city.name })),
  ];
  const categoryOptions = [{ value: "" as const, label: "Any kind" }, ...Object.entries(EVENT_CATEGORIES).map(([value, label]) => ({ value: categoryOf(value), label }))];

  return (
    <View style={{ flex: 1, backgroundColor: palette.surface }}>
      <Header
        title="Events"
        right={
          <IconButton label="Host an event" onPress={() => router.push("/event-form")}>
            <Plus size={20} color={palette.ink} />
          </IconButton>
        }
      />
      <SectionList
        sections={sections}
        keyExtractor={(event) => event.id}
        stickySectionHeadersEnabled
        ListHeaderComponent={
          <View style={{ padding: 16 }}>
            <Group>
              <SelectRow label="Where" options={whereOptions} value={where} onChange={setWhere} />
              <SelectRow label="Kind" options={categoryOptions} value={category} onChange={setCategory} last />
            </Group>
          </View>
        }
        renderSectionHeader={({ section }) => (
          <Text variant="small" accessibilityRole="header" style={{ fontFamily: font.semibold, paddingHorizontal: 16, paddingVertical: 8, backgroundColor: palette.wash, color: palette.inkMuted }}>
            {section.title}
          </Text>
        )}
        renderItem={({ item }) => <EventRow event={item} going={shown.kind === "ready" && shown.rsvps.get(item.id) === "going"} />}
        ListEmptyComponent={
          shown.kind === "loading" ? (
            <FeedSkeleton rows={3} />
          ) : shown.kind === "failed" ? (
            <EmptyState title="Events didn't load" action={<Button label="Try again" size="medium" onPress={() => read(key)} />}>
              {PROBLEM[shown.reason]}
            </EmptyState>
          ) : (
            <EmptyState icon={<CalendarDays size={26} color={palette.inkMuted} />} title="No events coming up" action={<Button label="Host an event" size="medium" onPress={() => router.push("/event-form")} />}>
              {where === "anywhere" ? "Be the first to share one with the community." : "Try anywhere, or another kind of event."}
            </EmptyState>
          )
        }
        refreshControl={
          shown.kind === "ready" ? (
            <RefreshControl
              refreshing={shown.refreshing}
              onRefresh={() => {
                setState({ key, state: { ...shown, refreshing: true } });
                read(key);
              }}
              tintColor={palette.inkMuted}
            />
          ) : undefined
        }
        contentContainerStyle={{ flexGrow: 1, paddingBottom: 24 }}
      />
    </View>
  );
}

const categoryOf = (value: string): EventCategory => (Object.keys(EVENT_CATEGORIES).find((key): key is EventCategory => key === value) ?? "other");

function groupByDay(events: CommunityEvent[]) {
  const sections: { title: string; data: CommunityEvent[] }[] = [];
  for (const event of events) {
    const title = dayLabel(event.startsAt, new Date(), timeZone);
    const last = sections.at(-1);
    if (last?.title === title) last.data.push(event);
    else sections.push({ title, data: [event] });
  }
  return sections;
}
