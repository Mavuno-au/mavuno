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
import { HAIRLINE, useLargeText, usePalette } from "@/ui/theme";

// One person or organisation in a list: who to follow, likers, search
// results, followers. Tapping opens the profile; Follow sits on the right.
// Onboarding passes open={false}: profiles aren't reachable until it's done.
// A suggestion has `onDismiss`: a compact Follow, then Not for me beside it.
// The headline or bio runs under the whole row, Follow included, as on
// Bluesky's profile cards, which gives it twice the width it had beside the
// avatar. `detail` (why they're suggested, or where they are) is a line of
// its own after it, so it never replaces who they are.
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
  const about = person.headline ?? (person.bio || null);
  const { following } = useProfileShadow(person.id, { following: person.following, followers: person.followers });
  const trailing = onDismiss ? (
    <View style={{ flexDirection: "row", alignItems: "center" }}>
      <FollowButton profileId={person.id} name={person.displayName} following={following} followsYou={person.followsYou} compact />
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
    (action ?? (follow && viewer?.id !== person.id ? <FollowButton profileId={person.id} name={person.displayName} following={following} followsYou={person.followsYou} /> : null))
  );
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={[`${person.displayName}, @${person.username}`, detail, about].filter(Boolean).join(". ")}
      accessibilityHint={open ? "Opens this profile" : undefined}
      disabled={!open}
      onPress={() => router.push(`/profile/${person.username}`)}
      unstable_pressDelay={100}
      style={({ pressed }) => ({
        gap: 4,
        paddingLeft: 16,
        paddingRight: onDismiss && !large ? 4 : 16,
        paddingVertical: onDismiss ? 9 : 12,
        borderBottomWidth: onDismiss ? 0 : HAIRLINE,
        borderBottomColor: palette.hairline,
        backgroundColor: pressed ? palette.wash : "transparent",
      })}
    >
      <View style={{ flexDirection: large ? "column" : "row", alignItems: large ? "flex-start" : "center", gap: 12 }}>
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
        </View>
        {trailing}
      </View>
      {about || detail ? (
        <View style={{ gap: 2, marginLeft: large ? 0 : 56, paddingRight: onDismiss && !large ? 12 : 0 }}>
          {about ? (
            <Text variant="subhead" tone="muted" numberOfLines={2}>
              {about}
            </Text>
          ) : null}
          {detail ? (
            <Text variant="small" tone="muted" numberOfLines={2}>
              {detail}
            </Text>
          ) : null}
        </View>
      ) : null}
    </Pressable>
  );
}
