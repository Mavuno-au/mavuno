import { Image } from "expo-image";
import { router } from "expo-router";
import { Pressable, View } from "react-native";
import type { SpaceListItem } from "@/lib/community";
import { compact } from "@/lib/format";
import { Chip } from "@/ui/controls";
import { font, Text } from "@/ui/text";
import { usePalette } from "@/ui/theme";

// A space in a horizontal list: its city's photo, or its emoji, its name and members.
export function SpaceCard({ space }: { space: SpaceListItem }) {
  const palette = usePalette();
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`${space.name}, ${space.members} members${space.joined ? ", joined" : ""}`}
      onPress={() => router.push(`/space/${space.slug}`)}
      style={({ pressed }) => ({ width: 180, borderRadius: 14, overflow: "hidden", borderWidth: 1, borderColor: palette.hairline, backgroundColor: pressed ? palette.wash : palette.surface })}
    >
      <View style={{ height: 88, backgroundColor: palette.wash, alignItems: "center", justifyContent: "center" }}>
        {space.photo ? <Image source={space.photo.thumbUrl} style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0 }} contentFit="cover" accessible={false} /> : <Text style={{ fontSize: 34 }}>{space.emoji ?? "🌱"}</Text>}
      </View>
      <View style={{ padding: 10, gap: 4 }}>
        <Text variant="name" numberOfLines={1}>
          {space.emoji && space.photo ? `${space.emoji} ` : ""}
          {space.name}
        </Text>
        <Text variant="caption" tone="muted">
          {compact(space.members)} {space.members === 1 ? "member" : "members"}
        </Text>
        {space.joined ? <Chip tone="primary">Joined</Chip> : null}
      </View>
    </Pressable>
  );
}

// A space in a list, as on the website's Spaces page.
export function SpaceRow({ space }: { space: SpaceListItem }) {
  const palette = usePalette();
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`${space.name}, ${space.members} members${space.joined ? ", joined" : ""}`}
      onPress={() => router.push(`/space/${space.slug}`)}
      style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: palette.hairline, backgroundColor: pressed ? palette.wash : "transparent" })}
    >
      <View style={{ width: 48, height: 48, borderRadius: 12, overflow: "hidden", backgroundColor: palette.wash, alignItems: "center", justifyContent: "center" }}>
        {space.photo ? <Image source={space.photo.thumbUrl} style={{ width: 48, height: 48 }} contentFit="cover" accessible={false} /> : <Text style={{ fontSize: 24 }}>{space.emoji ?? "🌱"}</Text>}
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Text variant="name" numberOfLines={1} style={{ flexShrink: 1 }}>
            {space.name}
          </Text>
          {space.official ? (
            <Text variant="caption" tone="primary" style={{ fontFamily: font.medium }}>
              Official
            </Text>
          ) : null}
        </View>
        {space.description ? (
          <Text variant="subhead" tone="muted" numberOfLines={2}>
            {space.description}
          </Text>
        ) : null}
        <Text variant="caption" tone="muted">
          {compact(space.members)} {space.members === 1 ? "member" : "members"} · {compact(space.posts)} {space.posts === 1 ? "post" : "posts"}
        </Text>
      </View>
      {space.joined ? <Chip tone="primary">Joined</Chip> : null}
    </Pressable>
  );
}
