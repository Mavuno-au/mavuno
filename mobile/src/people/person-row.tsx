import { router } from "expo-router";
import { BadgeCheck } from "lucide-react-native";
import type { ReactNode } from "react";
import { Pressable, View } from "react-native";
import type { PersonSummary } from "@/lib/domain";
import { useViewer } from "@/data/session";
import { useProfileShadow } from "@/data/shadow";
import { FollowButton } from "@/people/follow-button";
import { Avatar, ColourDot } from "@/ui/avatar";
import { Text } from "@/ui/text";
import { useLargeText, usePalette } from "@/ui/theme";

// One person or organisation in a list: who to follow, likers, search
// results, followers. Tapping opens the profile; Follow sits on the right.
export function PersonRow({ person, detail, action, follow = true }: { person: PersonSummary; detail?: string | null; action?: ReactNode; follow?: boolean }) {
  const palette = usePalette();
  const viewer = useViewer();
  const large = useLargeText();
  const line = detail ?? person.headline ?? (person.bio || null);
  const { following } = useProfileShadow(person.id, { following: person.following, followers: person.followers });
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${person.displayName}, @${person.username}${line ? `. ${line}` : ""}`}
      accessibilityHint="Opens this profile"
      onPress={() => router.push(`/profile/${person.username}`)}
      style={({ pressed }) => ({ flexDirection: large ? "column" : "row", alignItems: large ? "flex-start" : "center", gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: palette.hairline, backgroundColor: pressed ? palette.wash : "transparent" })}
    >
      <Avatar person={person} size={44} />
      <View style={{ flex: large ? undefined : 1, minWidth: 0, gap: 2 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Text variant="name" numberOfLines={1} style={{ flexShrink: 1 }}>
            {person.displayName}
          </Text>
          {person.verified ? <BadgeCheck size={16} color={palette.primary} /> : null}
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
          <ColourDot colour={person.colour} />
          <Text variant="meta" tone="muted" numberOfLines={1} style={{ flexShrink: 1 }}>
            @{person.username}
            {person.followsYou ? " · Follows you" : ""}
          </Text>
        </View>
        {line ? (
          <Text variant="subhead" tone="muted" numberOfLines={2}>
            {line}
          </Text>
        ) : null}
      </View>
      {action ?? (follow && viewer?.id !== person.id ? <FollowButton profileId={person.id} following={following} followsYou={person.followsYou} /> : null)}
    </Pressable>
  );
}
