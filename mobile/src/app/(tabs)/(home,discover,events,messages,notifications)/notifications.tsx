import { useFocusEffect, useIsFocused } from "expo-router";
import { ArrowUp, Bell, ChevronDown } from "lucide-react-native";
import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { NOTIFICATION_FILTERS, type NotificationFilterKey, type NotificationGroup } from "@/lib/notifications";
import { useCounts } from "@/data/counts";
import { loadNotifications, markNotificationsRead } from "@/data/notifications";
import { useViewer } from "@/data/session";
import { useList } from "@/data/use-list";
import { NotificationRow } from "@/notifications/notification-row";
import { EmptyState } from "@/ui/controls";
import { Header } from "@/ui/header";
import { PagedList } from "@/ui/list";
import { ActionSheet } from "@/ui/sheet";
import { font, Text } from "@/ui/text";
import { usePalette } from "@/ui/theme";
import { onSoftReset } from "@/util/events";

type Item = { id: string; group: NotificationGroup };

// How often an open inbox asks whether anything arrived, as the website does.
const ARRIVALS_EVERY = 30_000;

const cursorText = (next: { at: string; key: string } | null) => (next ? `${next.at}\n${next.key}` : null);
const cursorOf = (text: string) => {
  const [at = "", key = ""] = text.split("\n");
  return { kind: "before" as const, at, key };
};

export default function Notifications() {
  const palette = usePalette();
  const viewer = useViewer();
  const counts = useCounts();
  const focused = useIsFocused();
  const [filter, setFilter] = useState<NotificationFilterKey>("all");
  const [identityId, setIdentityId] = useState<string | null>(null);
  const [choosing, setChoosing] = useState(false);
  const [arrived, setArrived] = useState(0);
  // Groups that were unread when this visit opened them keep their colour.
  const [seenUnread, setSeenUnread] = useState<ReadonlySet<string>>(new Set());

  const identities = viewer ? [{ id: viewer.id, displayName: "You", username: viewer.username }, ...viewer.organisations] : [];
  const identity = identities.find((candidate) => candidate.id === identityId) ?? identities[0];
  const recipientId = identity?.id ?? "";
  const own = identity?.id === viewer?.id;
  const key = `${recipientId}:${filter}`;

  const { refresh: refreshCounts } = counts;
  const list = useList<Item>(
    async (cursor) => {
      const page = await loadNotifications(recipientId, filter, cursor ? cursorOf(cursor) : { kind: "first" });
      // Once a filter has been shown, what it shows is read: only that
      // filter's types. What was unread keeps its colour for this visit.
      const unread = page.groups.filter((group) => group.unread).map((group) => group.key);
      if (unread.length > 0) {
        setSeenUnread((current) => new Set([...current, ...unread]));
        void markNotificationsRead(recipientId, filter).then(refreshCounts);
      }
      return { items: page.groups.map((group) => ({ id: group.key, group })), next: cursorText(page.next) };
    },
    key,
    { enabled: recipientId !== "" },
  );
  const ready = list.state.kind === "ready" ? list.state : null;

  // Coming back to the tab starts a new visit, and reads it again.
  const { refresh: refreshList } = list;
  const visited = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (visited.current) refreshList();
      visited.current = true;
      return () => setSeenUnread(new Set());
    }, [refreshList]),
  );

  // While the inbox is open, new groups wait behind a pill, as new posts do.
  const newest = ready?.items[0]?.group.latestAt ?? null;
  useEffect(() => {
    if (!focused || !newest || !recipientId) return;
    const timer = setInterval(() => {
      void loadNotifications(recipientId, filter, { kind: "after", at: newest })
        .then((page) => setArrived(page.groups.length))
        .catch(() => undefined);
    }, ARRIVALS_EVERY);
    return () => clearInterval(timer);
  }, [focused, newest, recipientId, filter]);

  const showArrived = useCallback(() => {
    setArrived(0);
    refreshList();
  }, [refreshList]);

  useEffect(() => (focused ? onSoftReset(showArrived) : undefined), [focused, showArrived]);

  const chosen = NOTIFICATION_FILTERS.find((candidate) => candidate.key === filter) ?? NOTIFICATION_FILTERS[0];

  return (
    <View style={{ flex: 1, backgroundColor: palette.surface }}>
      <Header title="Notifications" />
      {identities.length > 1 ? (
        <Pressable accessibilityRole="button" accessibilityLabel={`Showing notifications for ${identity?.displayName ?? "you"}. Change`} onPress={() => setChoosing(true)} style={{ flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "center", minHeight: 36, paddingHorizontal: 12 }}>
          <Text variant="subhead" tone="muted">
            For
          </Text>
          <Text variant="subhead" tone="primary" style={{ fontFamily: font.semibold }}>
            {own ? "you" : identity?.displayName}
          </Text>
          <ChevronDown size={16} color={palette.primary} />
        </Pressable>
      ) : null}
      <View style={{ borderBottomWidth: 1, borderBottomColor: palette.hairline }}>
        <ScrollView horizontal scrollsToTop={false} showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 16, paddingVertical: 8 }} accessibilityRole="tablist">
          {NOTIFICATION_FILTERS.map((option) => {
            const selected = option.key === filter;
            return (
              <Pressable
                key={option.key}
                accessibilityRole="tab"
                accessibilityState={{ selected }}
                onPress={() => {
                  setArrived(0);
                  setFilter(option.key);
                }}
                style={{ minHeight: 36, paddingHorizontal: 14, borderRadius: 18, justifyContent: "center", backgroundColor: selected ? palette.ink : palette.wash }}
              >
                <Text variant="subhead" maxFontSizeMultiplier={1.6} style={{ fontFamily: selected ? font.semibold : font.medium, color: selected ? palette.surface : palette.ink }}>
                  {option.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>
      <View style={{ flex: 1 }}>
        <PagedList
          list={list}
          renderItem={({ item }) => <NotificationRow group={item.group} recipientId={recipientId} followable={own} seenUnread={seenUnread.has(item.id)} />}
          empty={
            <EmptyState icon={<Bell size={26} color={palette.inkMuted} />} title={chosen.empty.title}>
              {chosen.empty.body}
            </EmptyState>
          }
          end="That's everything."
          failedTitle="Notifications didn't load"
        />
        {arrived > 0 ? (
          <View pointerEvents="box-none" style={{ position: "absolute", top: 10, left: 0, right: 0, alignItems: "center" }}>
            <Pressable
              accessibilityRole="button"
              onPress={showArrived}
              style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 6, minHeight: 40, paddingHorizontal: 16, borderRadius: 20, backgroundColor: palette.primary, opacity: pressed ? 0.85 : 1 })}
            >
              <ArrowUp size={16} color={palette.primaryInk} strokeWidth={2.4} />
              <Text variant="label" tone="primaryInk">
                {arrived === 1 ? "1 new notification" : `${arrived} new notifications`}
              </Text>
            </Pressable>
          </View>
        ) : null}
      </View>
      <ActionSheet
        title="Notifications for"
        open={choosing}
        onClose={() => setChoosing(false)}
        actions={identities.map((candidate) => ({ label: candidate.id === viewer?.id ? "You" : candidate.displayName, checked: candidate.id === recipientId, onPress: () => setIdentityId(candidate.id) }))}
      />
    </View>
  );
}
