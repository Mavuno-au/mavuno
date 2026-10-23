import { createEventInCalendarAsync } from "expo-calendar/legacy";
import { Image } from "expo-image";
import { router, useLocalSearchParams } from "expo-router";
import { CalendarPlus, Check, Ellipsis, Globe, MapPin, Star, Ticket } from "lucide-react-native";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Alert, Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { EVENT_CATEGORIES, EVENT_FORMATS } from "@/lib/catalogue";
import { eventPlace, type CommunityEvent, type RsvpStatus } from "@/lib/community";
import type { ProfileCard } from "@/lib/domain";
import { eventDate } from "@/lib/format";
import { displayUrl } from "@/lib/text";
import { reasonOf, type Reason } from "@/data/errors";
import { siteLink } from "@/data/env";
import { cancelEvent, loadEvent, setRsvp } from "@/data/community";
import { useViewer } from "@/data/session";
import { DateBlock } from "@/community/event-row";
import { RichText } from "@/post/rich-text";
import { Avatar } from "@/ui/avatar";
import { Button, Chip, EmptyState, FeedSkeleton, IconButton, LoadFailed } from "@/ui/controls";
import { BackButton, Header } from "@/ui/header";
import { ActionSheet, type SheetAction } from "@/ui/sheet";
import { font, Text } from "@/ui/text";
import { usePalette } from "@/ui/theme";
import { toast } from "@/ui/toast";
import { openLink, shareLink } from "@/util/links";

type State = { kind: "missing" } | { kind: "failed"; reason: Reason } | { kind: "ready"; event: CommunityEvent; attendees: ProfileCard[]; myRsvp: RsvpStatus | null };

const SIX_HOURS = 6 * 60 * 60 * 1000;
// Events without an end time count as running for six hours, as in the database.
const hasEnded = (event: CommunityEvent) => Date.parse(event.endsAt ?? "") < Date.now() || (!event.endsAt && Date.parse(event.startsAt) + SIX_HOURS < Date.now());

const CONFIRMATIONS: Record<RsvpStatus | "none", string> = { going: "You're going", interested: "Marked as interested", none: "RSVP withdrawn" };

// The host's cover runs edge to edge; the date block sits beside the title.
export default function EventScreen() {
  const palette = usePalette();
  const insets = useSafeAreaInsets();
  const viewer = useViewer();
  const eventId = String(useLocalSearchParams().id ?? "");
  const [loaded, setLoaded] = useState<{ id: string; state: State } | null>(null);
  const [mine, setMine] = useState<{ id: string; status: RsvpStatus | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const [menu, setMenu] = useState(false);
  const viewerId = viewer?.id ?? null;

  const read = useCallback(() => {
    if (!viewerId) return;
    void loadEvent(eventId, viewerId)
      .then((found) => setLoaded({ id: eventId, state: found ? { kind: "ready", ...found } : { kind: "missing" } }))
      .catch((error: unknown) => setLoaded({ id: eventId, state: { kind: "failed", reason: reasonOf(error) } }));
  }, [eventId, viewerId]);

  useEffect(read, [read]);

  const state = loaded?.id === eventId ? loaded.state : undefined;
  if (state?.kind !== "ready" || !viewer) {
    return (
      <View style={{ flex: 1, backgroundColor: palette.surface }}>
        <Header title="Event" left={<BackButton fallback="/events" />} />
        {state === undefined ? <FeedSkeleton rows={2} /> : null}
        {state?.kind === "missing" ? <EmptyState title="We couldn't find that event">It may have been removed.</EmptyState> : null}
        {state?.kind === "failed" ? <LoadFailed title="This event didn't load" reason={state.reason} onRetry={read} /> : null}
      </View>
    );
  }

  const { event, attendees } = state;
  const rsvp = mine?.id === event.id ? mine.status : state.myRsvp;
  const ended = hasEnded(event);
  const host = viewer.id === event.hostId || viewer.organisations.some((organisation) => organisation.id === event.hostId && organisation.role !== "editor");
  const full = event.capacity !== null && event.going >= event.capacity && state.myRsvp !== "going";
  const showLink = event.onlineUrl !== null && (host || rsvp === "going");
  const where = eventPlace(event);
  const open = event.review.kind === "published" && !event.cancelled && !ended;

  async function choose(status: RsvpStatus | null) {
    if (!viewer) return;
    const previous = rsvp;
    setMine({ id: event.id, status });
    setBusy(true);
    const result = await setRsvp(viewer.id, event.id, status);
    setBusy(false);
    if (!result.ok) {
      setMine({ id: event.id, status: previous });
      return Alert.alert("Couldn't change your RSVP", result.error);
    }
    toast(CONFIRMATIONS[status ?? "none"]);
    read();
  }

  // The iOS calendar sheet, instead of downloading a calendar file. From iOS
  // 17 (the app's minimum) it needs no calendar permission.
  async function addToCalendar() {
    try {
      await createEventInCalendarAsync({
        title: event.title,
        startDate: new Date(event.startsAt),
        endDate: new Date(event.endsAt ?? Date.parse(event.startsAt) + 2 * 60 * 60 * 1000),
        location: event.format === "online" ? (showLink ? (event.onlineUrl ?? undefined) : "Online") : [event.venue, event.address].filter(Boolean).join(", ") || where,
        notes: `${event.description}\n\n${siteLink(`/events/${event.id}`)}`,
        timeZone: event.timezone,
      });
    } catch {
      Alert.alert("Couldn't open your calendar", "Try again in a moment.");
    }
  }

  const actions: SheetAction[] = [
    { label: "Share event", onPress: () => shareLink(siteLink(`/events/${event.id}`)) },
    ...(event.review.kind === "published" ? [{ label: "Write a post about it", onPress: () => router.push({ pathname: "/compose", params: { event: event.id, placeholder: "Say a few words about it" } }) }] : []),
    ...(host
      ? [
          { label: "Edit event", onPress: () => router.push({ pathname: "/event-form", params: { id: event.id } }) },
          ...(event.cancelled || ended
            ? []
            : [
                {
                  label: "Cancel event",
                  destructive: true,
                  onPress: () =>
                    Alert.alert("Cancel this event?", "Everyone sees it's cancelled. You can't undo this.", [
                      { text: "Keep it", style: "cancel" },
                      { text: "Cancel event", style: "destructive", onPress: () =>
                          void cancelEvent(event.id).then((result) => {
                            if (!result.ok) return Alert.alert("Couldn't cancel", result.error);
                            toast("Event cancelled");
                            read();
                          }),
                      },
                    ]),
                },
              ]),
        ]
      : [{ label: "Report event", destructive: true, onPress: () => router.push({ pathname: "/report", params: { type: "event", id: event.id } }) }]),
  ];

  return (
    <View style={{ flex: 1, backgroundColor: palette.surface }}>
      <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>
        {event.coverUrl ? (
          <Image source={event.coverUrl} style={{ height: 240, backgroundColor: palette.wash }} contentFit="cover" accessibilityLabel={`Cover for ${event.title}`} />
        ) : (
          <View style={{ height: insets.top + 60, backgroundColor: palette.primarySoft }} />
        )}
        <View style={{ padding: 16, gap: 14 }}>
          {event.review.kind === "pending" ? <Chip tone="warning">Waiting for review. Only you can see it until a moderator approves it.</Chip> : null}
          {event.review.kind === "rejected" ? <Chip tone="danger">Not approved{event.review.reason ? `: ${event.review.reason}` : ""}</Chip> : null}
          {event.cancelled ? (
            <View accessibilityRole="alert" style={{ padding: 12, borderRadius: 10, backgroundColor: palette.destructiveSoft }}>
              <Text variant="callout" tone="destructive">
                This event was cancelled.
              </Text>
            </View>
          ) : null}
          <View style={{ flexDirection: "row", gap: 14, alignItems: "flex-start" }}>
            <DateBlock iso={event.startsAt} timeZone={event.timezone} size={60} />
            <View style={{ flex: 1, gap: 4 }}>
              <Text variant="title" accessibilityRole="header">
                {event.title}
              </Text>
              <Text variant="subhead" tone="muted">
                {EVENT_CATEGORIES[event.category]} · {EVENT_FORMATS[event.format]}
              </Text>
            </View>
          </View>
          <Pressable accessibilityRole="link" onPress={() => router.push(`/profile/${event.host.username}`)} style={{ flexDirection: "row", alignItems: "center", gap: 10, minHeight: 44 }}>
            <Avatar person={event.host} size={32} />
            <Text variant="callout">
              Hosted by <Text style={{ fontFamily: font.semibold }}>{event.host.displayName}</Text>
            </Text>
          </Pressable>
          <View style={{ gap: 10 }}>
            <Fact icon={<CalendarPlus size={18} color={palette.inkMuted} />}>
              {eventDate(event.startsAt, event.timezone)}
              {event.endsAt ? ` to ${eventDate(event.endsAt, event.timezone)}` : ""}
            </Fact>
            {event.format !== "online" && where ? (
              <Fact icon={<MapPin size={18} color={palette.inkMuted} />}>
                <View style={{ gap: 2 }}>
                  <Text variant="callout">{where}</Text>
                  {event.address && event.address !== event.venue ? (
                    <Text variant="subhead" tone="muted">
                      {event.address}
                    </Text>
                  ) : null}
                </View>
              </Fact>
            ) : null}
            {event.format !== "in_person" ? (
              <Fact icon={<Globe size={18} color={palette.inkMuted} />}>
                {showLink && event.onlineUrl ? (
                  <Text variant="callout" tone="primary" accessibilityRole="link" onPress={() => event.onlineUrl && openLink(event.onlineUrl)}>
                    {displayUrl(event.onlineUrl)}
                  </Text>
                ) : (
                  "The link shows here once you're going."
                )}
              </Fact>
            ) : null}
            {event.ticketUrl ? (
              <Fact icon={<Ticket size={18} color={palette.inkMuted} />}>
                <Text variant="callout" tone="primary" accessibilityRole="link" onPress={() => event.ticketUrl && openLink(event.ticketUrl)}>
                  {event.free ? "Free, register here" : "Tickets"}
                </Text>
              </Fact>
            ) : event.free ? (
              <Fact icon={<Ticket size={18} color={palette.inkMuted} />}>Free</Fact>
            ) : null}
          </View>

          {open ? (
            <View style={{ gap: 8 }}>
              <View style={{ flexDirection: "row", gap: 10, flexWrap: "wrap" }}>
                <Button
                  label={full ? "Full" : rsvp === "going" ? "You're going" : "Going"}
                  variant={rsvp === "going" ? "primary" : "outline"}
                  size="medium"
                  icon={<Check size={16} color={rsvp === "going" ? palette.primaryInk : palette.ink} />}
                  disabled={busy || full}
                  onPress={() => void choose(rsvp === "going" ? null : "going")}
                />
                <Button
                  label="Interested"
                  variant={rsvp === "interested" ? "primary" : "outline"}
                  size="medium"
                  icon={<Star size={16} color={rsvp === "interested" ? palette.primaryInk : palette.ink} />}
                  disabled={busy}
                  onPress={() => void choose(rsvp === "interested" ? null : "interested")}
                />
                {rsvp ? <Button label="Can't make it" variant="plain" size="medium" disabled={busy} onPress={() => void choose(null)} /> : null}
              </View>
              {event.capacity !== null ? (
                <Text variant="small" tone="muted">
                  {Math.min(event.going, event.capacity)} of {event.capacity} places taken
                </Text>
              ) : null}
            </View>
          ) : ended && !event.cancelled ? (
            <Text variant="callout" tone="muted">
              This event has ended.
            </Text>
          ) : null}

          {!event.cancelled && !ended ? <Button label="Add to calendar" variant="outline" size="medium" icon={<CalendarPlus size={16} color={palette.ink} />} onPress={() => void addToCalendar()} style={{ alignSelf: "flex-start" }} /> : null}

          {event.description ? <RichText body={event.description} variant="callout" /> : null}

          {attendees.length > 0 ? (
            <View style={{ gap: 8 }}>
              <Text variant="label">{event.going === 1 ? "1 going" : `${event.going} going`}</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {attendees.map((person) => (
                  <Pressable key={person.id} accessibilityRole="link" accessibilityLabel={person.displayName} onPress={() => router.push(`/profile/${person.username}`)}>
                    <Avatar person={person} size={36} />
                  </Pressable>
                ))}
              </View>
            </View>
          ) : null}
          {event.space ? (
            <Text variant="subhead" tone="primary" accessibilityRole="link" onPress={() => event.space && router.push(`/space/${event.space.slug}`)}>
              {event.space.emoji ? `${event.space.emoji} ` : ""}In {event.space.name}
            </Text>
          ) : null}
        </View>
      </ScrollView>
      <View style={{ position: "absolute", top: insets.top + 4, left: 16, right: 16, flexDirection: "row", justifyContent: "space-between" }}>
        <BackButton fallback="/events" />
        <IconButton label="Event options" onPress={() => setMenu(true)}>
          <Ellipsis size={19} color={palette.ink} />
        </IconButton>
      </View>
      <ActionSheet title={event.title} actions={actions} open={menu} onClose={() => setMenu(false)} />
    </View>
  );
}

function Fact({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 10 }}>
      <View style={{ marginTop: 2 }}>{icon}</View>
      {typeof children === "string" || Array.isArray(children) ? (
        <Text variant="callout" style={{ flex: 1 }}>
          {children}
        </Text>
      ) : (
        <View style={{ flex: 1 }}>{children}</View>
      )}
    </View>
  );
}
