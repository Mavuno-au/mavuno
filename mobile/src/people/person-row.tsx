import { router } from "expo-router";
import { BadgeCheck, X } from "lucide-react-native";
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
// Onboarding passes open={false}: profiles aren't reachable until it's done.
// A suggestion has `onDismiss`: a compact Follow, then Not for me beside it.
export function PersonRow({
  person,
  detail,
  action,
  follow = true,
  open = true,
  onDismiss,
}: {
  person: PersonSummary;
  detail?: string | null;
  action?: ReactNode;
  follow?: boolean;
  open?: boolean;
  onDismiss?: () => void;
}) {
  const palette = usePalette();
  const viewer = useViewer();
  const large = useLargeText();
  const line = detail ?? person.headline ?? (person.bio || null);
  const { following } = useProfileShadow(person.id, { following: person.following, followers: person.followers });
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${person.displayName}, @${person.username}${line ? `. ${line}` : ""}`}
      accessibilityHint={open ? "Opens this profile" : undefined}
      disabled={!open}
      onPress={() => router.push(`/profile/${person.username}`)}
      unstable_pressDelay={100}
      style={({ pressed }) => ({
        flexDirection: large ? "column" : "row",
        alignItems: large ? "flex-start" : "center",
        gap: 12,
        paddingLeft: 16,
        paddingRight: onDismiss && !large ? 4 : 16,
        paddingVertical: onDismiss ? 9 : 12,
        borderBottomWidth: onDismiss ? 0 : 1,
        borderBottomColor: palette.hairline,
        backgroundColor: pressed ? palette.wash : "transparent",
      })}
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
          </Text>
          {/* Said in full; the handle gives way first. */}
          {person.followsYou ? (
            <Text variant="caption" tone="muted" style={{ flexShrink: 0, paddingHorizontal: 6, paddingVertical: 1, borderRadius: 6, overflow: "hidden", backgroundColor: palette.wash }}>
              Follows you
            </Text>
          ) : null}
        </View>
        {line ? (
          <Text variant="subhead" tone="muted" numberOfLines={2}>
            {line}
          </Text>
        ) : null}
      </View>
      {onDismiss ? (
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <FollowButton profileId={person.id} following={following} followsYou={person.followsYou} compact />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Not for me: ${person.displayName}`}
            onPress={onDismiss}
            style={{ width: 40, height: 44, alignItems: "center", justifyContent: "center" }}
          >
            <X size={17} color={palette.inkMuted} strokeWidth={2.2} />
          </Pressable>
        </View>
      ) : (
        (action ?? (follow && viewer?.id !== person.id ? <FollowButton profileId={person.id} following={following} followsYou={person.followsYou} /> : null))
      )}
    </Pressable>
  );
}
