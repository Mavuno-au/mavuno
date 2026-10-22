import { router } from "expo-router";
import { Pressable, View } from "react-native";
import { EVENT_CATEGORIES } from "@/lib/catalogue";
import { eventPlace, type CommunityEvent } from "@/lib/community";
import { eventDate } from "@/lib/format";
import { Chip } from "@/ui/controls";
import { font, Text } from "@/ui/text";
import { usePalette } from "@/ui/theme";

// The date block from the event screen: the day is readable at a glance.
export function DateBlock({ iso, timeZone, size = 52 }: { iso: string; timeZone: string; size?: number }) {
  const palette = usePalette();
  const date = new Date(iso);
  const month = date.toLocaleDateString("en-AU", { month: "short", timeZone }).toUpperCase();
  const day = date.toLocaleDateString("en-AU", { day: "numeric", timeZone });
  return (
    <View accessible={false} style={{ width: size, minHeight: size, borderRadius: 12, borderWidth: 1, borderColor: palette.hairline, alignItems: "center", justifyContent: "center", backgroundColor: palette.surface }}>
      <Text allowFontScaling={false} style={{ fontFamily: font.monoMedium, fontSize: 11, color: palette.primary, letterSpacing: 0.6 }}>
        {month}
      </Text>
      <Text allowFontScaling={false} style={{ fontFamily: font.bold, fontSize: size * 0.42, lineHeight: size * 0.5, color: palette.ink }}>
        {day}
      </Text>
    </View>
  );
}

export function EventRow({ event, going = false }: { event: CommunityEvent; going?: boolean }) {
  const palette = usePalette();
  const where = eventPlace(event);
  const when = eventDate(event.startsAt, event.timezone);
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`${event.title}. ${when}. ${where}${going ? ". You're going" : ""}`}
      onPress={() => router.push(`/event/${event.id}`)}
      style={({ pressed }) => ({ flexDirection: "row", gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: palette.hairline, backgroundColor: pressed ? palette.wash : "transparent" })}
    >
      <DateBlock iso={event.startsAt} timeZone={event.timezone} />
      <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
        <Text variant="name" numberOfLines={2}>
          {event.title}
        </Text>
        <Text variant="meta" tone="muted" numberOfLines={1}>
          {when}
        </Text>
        <Text variant="subhead" tone="muted" numberOfLines={1}>
          {where || EVENT_CATEGORIES[event.category]}
        </Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 2 }}>
          {going ? <Chip tone="primary">You're going</Chip> : null}
          {event.going > 0 ? <Chip>{event.going} going</Chip> : null}
          {event.free ? <Chip>Free</Chip> : null}
        </View>
      </View>
    </Pressable>
  );
}
