import { fail } from "@/lib/result";
import { setFollow } from "@/data/profiles";
import { useSession } from "@/data/session";
import { useShadowWriter } from "@/data/shadow";
import * as Haptics from "expo-haptics";
import { Pressable } from "react-native";
import { Button } from "@/ui/controls";
import { font, Text } from "@/ui/text";
import { usePalette } from "@/ui/theme";
import { toast } from "@/ui/toast";
import { useToggleQueue } from "@/util/toggle-queue";

// The website's follow button (src/components/people/follow-button.tsx):
// "Follow back" when they already follow you, "Following" once you do. The
// button changes as soon as it is tapped; the server hears in turn. `compact`
// is the design's 34-point pill for lists of suggestions, still 44 to tap.
export function FollowButton({ profileId, following, followsYou, compact = false }: { profileId: string; following: boolean; followsYou: boolean; compact?: boolean }) {
  const palette = usePalette();
  const session = useSession();
  const viewerId = session.kind === "signed-in" ? session.session.user.id : null;
  const { setFollowing } = useShadowWriter();
  const toggle = useToggleQueue({
    run: (on) => (viewerId ? setFollow(viewerId, profileId, on) : Promise.resolve(fail("Sign in first."))),
    onSettled: (on) => setFollowing(profileId, on),
    onError: (message, on) => toast(`${on ? "Couldn't follow" : "Couldn't unfollow"}. ${message}`, { tone: "error" }),
  });

  const label = following ? "Following" : followsYou ? "Follow back" : "Follow";
  const hint = following ? "Unfollows this account" : "Follows this account";
  const press = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setFollowing(profileId, !following);
    toggle(!following, following);
  };

  if (compact) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityHint={hint}
        onPress={press}
        hitSlop={{ top: 5, bottom: 5 }}
        style={({ pressed }) => ({
          minHeight: 34,
          // Wide enough for "Following", so the pill doesn't change size when tapped.
          minWidth: 96,
          paddingHorizontal: 14,
          borderRadius: 17,
          borderWidth: 1,
          borderColor: following ? palette.rail : palette.primary,
          backgroundColor: following ? palette.surface : palette.primary,
          alignItems: "center",
          justifyContent: "center",
          opacity: pressed ? 0.75 : 1,
        })}
      >
        <Text variant="subhead" tone={following ? "ink" : "primaryInk"} style={{ fontFamily: font.semibold }} maxFontSizeMultiplier={1.4}>
          {label}
        </Text>
      </Pressable>
    );
  }
  return <Button label={label} hint={hint} variant={following ? "outline" : "primary"} size="medium" onPress={press} style={{ minWidth: 112 }} />;
}
