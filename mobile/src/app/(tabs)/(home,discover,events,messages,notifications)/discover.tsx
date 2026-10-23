import { router, useIsFocused } from "expo-router";
import { Briefcase, Hash, MapPin, Search, Users } from "lucide-react-native";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { LayoutAnimation, Pressable, RefreshControl, ScrollView, View } from "react-native";
import type { PersonSummary } from "@/lib/domain";
import { dismissSuggestion, loadActiveSpaces, loadSuggestions, loadTrendingTopics, type SpaceListItem } from "@/data/community";
import { reasonOf, type Reason } from "@/data/errors";
import { useViewer } from "@/data/session";
import { PersonRow } from "@/people/person-row";
import { SpaceRow } from "@/community/space-card";
import { EmptyState, LoadFailed, Pills, RowSkeleton } from "@/ui/controls";
import { Header } from "@/ui/header";
import { font, Text } from "@/ui/text";
import { HAIRLINE, usePalette } from "@/ui/theme";
import { toast } from "@/ui/toast";
import { onSoftReset } from "@/util/events";
import { useReduceMotion } from "@/util/motion";

type Tab = "overview" | "people" | "organisations" | "topics";

const TABS = [
  { key: "overview", label: "Overview" },
  { key: "people", label: "People" },
  { key: "organisations", label: "Organisations" },
  { key: "topics", label: "Topics" },
] as const satisfies readonly { key: Tab; label: string }[];
type Topic = { topic: string; posts: number; people: number };
type Loaded = { topics: Topic[]; spaces: SpaceListItem[]; people: PersonSummary[]; organisations: PersonSummary[] };

// The website's Discover (src/app/(app)/discover) with search on top. Spaces,
// Opportunities and Nearby live here in the app, since they have no tab.
export default function Discover() {
  const palette = usePalette();
  const viewer = useViewer();
  const focused = useIsFocused();
  const reduceMotion = useReduceMotion();
  const [tab, setTab] = useState<Tab>("overview");
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [failed, setFailed] = useState<Reason | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set());
  const viewerId = viewer?.id ?? null;

  // A failure isn't shown as "No suggestions right now". A refresh that
  // fails keeps what was already here.
  const read = useCallback(() => {
    if (!viewerId) return;
    Promise.all([loadTrendingTopics(20), loadActiveSpaces(viewerId, 8), loadSuggestions(20, "person"), loadSuggestions(20, "organisation")]).then(
      ([topics, spaces, people, organisations]) => {
        setLoaded({ topics, spaces, people, organisations });
        setRefreshing(false);
      },
      (error: unknown) => {
        setFailed(reasonOf(error));
        setRefreshing(false);
      },
    );
  }, [viewerId]);

  useEffect(read, [read]);
  useEffect(() => (focused ? onSoftReset(read) : undefined), [focused, read]);

  // The website's Not for me: hidden from suggestions, with a way back. The
  // rows below close the gap rather than jump into it (Bluesky's dismiss),
  // except under Reduce Motion.
  const hide = (id: string, on: boolean) => {
    if (!reduceMotion) LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setHidden((current) => (on ? new Set([...current, id]) : new Set([...current].filter((other) => other !== id))));
  };
  const notForMe = (person: PersonSummary) => {
    if (!viewerId) return;
    hide(person.id, true);
    const hiding = dismissSuggestion(viewerId, person.id, true).then((result) => {
      if (result.ok) return true;
      hide(person.id, false);
      toast(`Couldn't hide them. ${result.error}`, { tone: "error" });
      return false;
    });
    // Undo waits for the hide to land, so the two can't arrive out of order.
    const undo = () => {
      hide(person.id, false);
      void hiding.then(async (hid) => {
        if (!hid) return;
        const result = await dismissSuggestion(viewerId, person.id, false);
        if (result.ok) return;
        hide(person.id, true);
        toast(`Couldn't bring them back. ${result.error}`, { tone: "error" });
      });
    };
    toast("Hidden from suggestions", { action: { label: "Undo", onPress: undo } });
  };

  const suggestion = (person: PersonSummary) => <PersonRow key={person.id} person={person} detail={person.reason ?? undefined} onDismiss={() => notForMe(person)} />;

  const people = (loaded?.people ?? []).filter((person) => !hidden.has(person.id));
  const organisations = (loaded?.organisations ?? []).filter((person) => !hidden.has(person.id));
  const shortcut = (label: string, icon: typeof MapPin, href: "/spaces" | "/opportunities" | "/nearby") => {
    const Icon = icon;
    return (
      <Pressable
        accessibilityRole="link"
        onPress={() => router.push(href)}
        style={({ pressed }) => ({ flex: 1, minHeight: 72, alignItems: "center", justifyContent: "center", gap: 6, borderRadius: 14, borderWidth: 1, borderColor: palette.hairline, backgroundColor: pressed ? palette.wash : palette.surface })}
      >
        <Icon size={20} color={palette.primary} />
        <Text variant="subhead" style={{ fontFamily: font.medium }} maxFontSizeMultiplier={1.6}>
          {label}
        </Text>
      </Pressable>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: palette.surface }}>
      <Header title="Discover" border={false} />
      <View style={{ paddingHorizontal: 16, paddingBottom: 8, gap: 8, borderBottomWidth: HAIRLINE, borderBottomColor: palette.hairline }}>
        <Pressable
          accessibilityRole="search"
          accessibilityLabel="Search people, organisations and posts"
          onPress={() => router.push("/search")}
          style={{ flexDirection: "row", alignItems: "center", gap: 8, minHeight: 44, paddingHorizontal: 12, borderRadius: 12, backgroundColor: palette.wash }}
        >
          <Search size={17} color={palette.inkMuted} />
          <Text variant="body" tone="muted">
            Search Mavuno
          </Text>
        </Pressable>
        {/* Pills rather than a segmented control: four labels don't fit one at large text sizes. */}
        <View style={{ marginHorizontal: -16 }}>
          <Pills label="Discover" options={TABS} value={tab} onChange={setTab} />
        </View>
      </View>
      <ScrollView
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              read();
            }}
            tintColor={palette.inkMuted}
          />
        }
        contentContainerStyle={{ paddingBottom: 32 }}
      >
        {!loaded && failed ? (
          <LoadFailed
            title="Discover didn't load"
            reason={failed}
            onRetry={() => {
              setFailed(null);
              read();
            }}
          />
        ) : null}
        {!loaded && !failed ? <RowSkeleton label="Loading suggestions" /> : null}
        {loaded && tab === "overview" ? (
          <View style={{ gap: 22, paddingTop: 16 }}>
            <View style={{ flexDirection: "row", gap: 10, paddingHorizontal: 16 }}>
              {shortcut("Spaces", Users, "/spaces")}
              {shortcut("Opportunities", Briefcase, "/opportunities")}
              {shortcut("Nearby", MapPin, "/nearby")}
            </View>
            {loaded.topics.length > 0 ? (
              <Section title="Trending topics">
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, paddingHorizontal: 16 }}>
                  {loaded.topics.slice(0, 10).map((topic) => (
                    <TopicChip key={topic.topic} topic={topic} />
                  ))}
                </View>
              </Section>
            ) : null}
            {loaded.spaces.length > 0 ? (
              <Section title="Active spaces" more={{ label: "All spaces", onPress: () => router.push("/spaces") }}>
                {loaded.spaces.slice(0, 4).map((space) => (
                  <SpaceRow key={space.id} space={space} brief />
                ))}
              </Section>
            ) : null}
            {people.length > 0 ? <Section title="Who to follow">{people.slice(0, 5).map(suggestion)}</Section> : null}
            {organisations.length > 0 ? <Section title="Organisations">{organisations.slice(0, 3).map(suggestion)}</Section> : null}
          </View>
        ) : null}
        {loaded && tab === "people" ? people.length > 0 ? people.map(suggestion) : <EmptyState icon={<Users size={26} color={palette.inkMuted} />} title="No suggestions right now">Check back soon, or search for someone you know.</EmptyState> : null}
        {loaded && tab === "organisations" ? (
          organisations.length > 0 ? (
            organisations.map(suggestion)
          ) : (
            <EmptyState icon={<Users size={26} color={palette.inkMuted} />} title="No organisations to suggest">
              Churches, mosques, community groups and businesses show here as they join.
            </EmptyState>
          )
        ) : null}
        {loaded && tab === "topics" ? (
          loaded.topics.length > 0 ? (
            loaded.topics.map((topic) => (
              <Pressable
                key={topic.topic}
                accessibilityRole="link"
                onPress={() => router.push(`/topic/${topic.topic}`)}
                style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 12, minHeight: 60, paddingHorizontal: 16, borderBottomWidth: HAIRLINE, borderBottomColor: palette.hairline, backgroundColor: pressed ? palette.wash : "transparent" })}
              >
                <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: palette.primarySoft, alignItems: "center", justifyContent: "center" }}>
                  <Hash size={18} color={palette.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text variant="name">#{topic.topic}</Text>
                  <Text variant="caption" tone="muted">
                    {topic.posts === 1 ? "1 post" : `${topic.posts} posts`} · {topic.people === 1 ? "1 person" : `${topic.people} people`} this week
                  </Text>
                </View>
              </Pressable>
            ))
          ) : (
            <EmptyState icon={<Hash size={26} color={palette.inkMuted} />} title="No topics this week">
              Add #topics to your posts and they show here.
            </EmptyState>
          )
        ) : null}
      </ScrollView>
    </View>
  );
}

function Section({ title, more, children }: { title: string; more?: { label: string; onPress: () => void }; children: ReactNode }) {
  return (
    <View style={{ gap: 10 }}>
      <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", paddingHorizontal: 16 }}>
        <Text variant="heading" accessibilityRole="header">
          {title}
        </Text>
        {more ? (
          <Pressable accessibilityRole="link" onPress={more.onPress} hitSlop={12}>
            <Text variant="subhead" tone="primary" style={{ fontFamily: font.medium }}>
              {more.label}
            </Text>
          </Pressable>
        ) : null}
      </View>
      <View>{children}</View>
    </View>
  );
}

function TopicChip({ topic }: { topic: Topic }) {
  const palette = usePalette();
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`#${topic.topic}, ${topic.posts} posts this week`}
      onPress={() => router.push(`/topic/${topic.topic}`)}
      style={({ pressed }) => ({ minHeight: 38, paddingHorizontal: 14, borderRadius: 19, justifyContent: "center", backgroundColor: pressed ? palette.primarySoft : palette.wash })}
    >
      <Text variant="subhead" style={{ fontFamily: font.medium }}>
        #{topic.topic}
      </Text>
    </Pressable>
  );
}
