import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import { router } from "expo-router";
import { BadgeCheck, Check } from "lucide-react-native";
import { useState } from "react";
import { Pressable, View } from "react-native";
import type { SpaceListItem } from "@/lib/community";
import { compact } from "@/lib/format";
import { setMembership } from "@/data/community";
import { useViewer } from "@/data/session";
import { font, Text } from "@/ui/text";
import { usePalette } from "@/ui/theme";
import { toast } from "@/ui/toast";

// A space in a list, as in the iPhone design's Discover: its city's photo or
// its emoji, its name, how busy it is, and Join right there. `brief` leaves
// out the description, for Discover's short list.
export function SpaceRow({ space, brief = false }: { space: SpaceListItem; brief?: boolean }) {
  const palette = usePalette();
  // What the viewer chose here wins over the list's copy, read when it loaded.
  const [chosen, setJoined] = useState<boolean | null>(null);
  const joined = chosen ?? space.joined;
  const counts = `${compact(space.members)} ${space.members === 1 ? "member" : "members"} · ${compact(space.posts)} ${space.posts === 1 ? "post" : "posts"}`;
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`${space.name}${space.official ? ", official" : ""}, ${counts}`}
      onPress={() => router.push(`/space/${space.slug}`)}
      unstable_pressDelay={100}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        paddingHorizontal: 16,
        paddingVertical: brief ? 8 : 12,
        borderBottomWidth: brief ? 0 : 1,
        borderBottomColor: palette.hairline,
        backgroundColor: pressed ? palette.wash : "transparent",
      })}
    >
      <View style={{ width: 44, height: 44, borderRadius: 12, overflow: "hidden", backgroundColor: palette.primarySoft, alignItems: "center", justifyContent: "center" }}>
        {space.photo ? <Image source={space.photo.thumbUrl} style={{ width: 44, height: 44 }} contentFit="cover" accessible={false} /> : <Text style={{ fontSize: 22 }}>{space.emoji ?? "🌱"}</Text>}
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
          <Text variant="name" numberOfLines={1} style={{ flexShrink: 1, fontSize: 16 }}>
            {space.name}
          </Text>
          {space.official ? <BadgeCheck size={15} color={palette.primary} /> : null}
        </View>
        {space.description && !brief ? (
          <Text variant="subhead" tone="muted" numberOfLines={2}>
            {space.description}
          </Text>
        ) : null}
        <Text variant="meta" tone="muted" numberOfLines={1}>
          {counts}
        </Text>
      </View>
      <JoinPill spaceId={space.id} name={space.name} joined={joined} onChange={setJoined} />
    </Pressable>
  );
}

// Join is a filled pill, Joined an outlined one with a tick. The pill is 34
// points tall but answers taps across 44, Apple's minimum.
function JoinPill({ spaceId, name, joined, onChange }: { spaceId: string; name: string; joined: boolean; onChange: (joined: boolean) => void }) {
  const palette = usePalette();
  const viewer = useViewer();
  const [busy, setBusy] = useState(false);
  if (!viewer) return null;
  const viewerId = viewer.id;

  async function toggle() {
    const next = !joined;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setBusy(true);
    onChange(next);
    const result = await setMembership(viewerId, spaceId, next);
    setBusy(false);
    if (result.ok) return;
    onChange(!next);
    toast(`${next ? `Couldn't join ${name}` : `Couldn't leave ${name}`}. ${result.error}`, { tone: "error" });
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={joined ? `Joined ${name}` : `Join ${name}`}
      accessibilityHint={joined ? "Leaves this space" : undefined}
      accessibilityState={{ selected: joined, busy }}
      disabled={busy}
      onPress={() => void toggle()}
      hitSlop={{ top: 5, bottom: 5 }}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: 5,
        minHeight: 34,
        minWidth: 88,
        justifyContent: "center",
        paddingHorizontal: 12,
        borderRadius: 17,
        borderWidth: 1,
        borderColor: joined ? palette.rail : palette.primary,
        backgroundColor: joined ? palette.surface : palette.primary,
        opacity: pressed || busy ? 0.7 : 1,
      })}
    >
      {joined ? <Check size={14} color={palette.ink} strokeWidth={2.6} /> : null}
      <Text variant="subhead" tone={joined ? "ink" : "primaryInk"} style={{ fontFamily: font.semibold }} maxFontSizeMultiplier={1.4}>
        {joined ? "Joined" : "Join"}
      </Text>
    </Pressable>
  );
}
