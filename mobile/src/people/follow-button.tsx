import { Alert } from "react-native";
import { fail } from "@/lib/result";
import { setFollow } from "@/data/profiles";
import { useSession } from "@/data/session";
import { useShadowWriter } from "@/data/shadow";
import { Button } from "@/ui/controls";
import { useToggleQueue } from "@/util/toggle-queue";

// The website's follow button (src/components/people/follow-button.tsx):
// "Follow back" when they already follow you, "Following" once you do. The
// button changes as soon as it is tapped; the server hears in turn.
export function FollowButton({ profileId, following, followsYou }: { profileId: string; following: boolean; followsYou: boolean }) {
  const session = useSession();
  const viewerId = session.kind === "signed-in" ? session.session.user.id : null;
  const { setFollowing } = useShadowWriter();
  const toggle = useToggleQueue({
    run: (on) => (viewerId ? setFollow(viewerId, profileId, on) : Promise.resolve(fail("Sign in first."))),
    onSettled: (on) => setFollowing(profileId, on),
    onError: (message, on) => Alert.alert(on ? "Couldn't follow" : "Couldn't unfollow", message),
  });

  return (
    <Button
      label={following ? "Following" : followsYou ? "Follow back" : "Follow"}
      hint={following ? "Unfollows this account" : "Follows this account"}
      variant={following ? "outline" : "primary"}
      size="medium"
      onPress={() => {
        setFollowing(profileId, !following);
        toggle(!following, following);
      }}
      style={{ minWidth: 112 }}
    />
  );
}
