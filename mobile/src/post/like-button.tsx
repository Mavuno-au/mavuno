import { Heart } from "lucide-react-native";
import { Alert, Pressable } from "react-native";
import type { Post } from "@/lib/domain";
import { compact, count } from "@/lib/format";
import { fail } from "@/lib/result";
import { setLike } from "@/data/posts";
import { useSession } from "@/data/session";
import { useShadowWriter } from "@/data/shadow";
import { font, Text } from "@/ui/text";
import { usePalette } from "@/ui/theme";
import { useToggleQueue } from "@/util/toggle-queue";

// The heart fills the moment it is tapped; the server hears in turn
// (toggle-queue.ts), and if it says no the heart empties again.
// `post` is the row as the shadow shows it, so the seed is what is on screen.
export function LikeButton({ post, size }: { post: Post; size: number }) {
  const palette = usePalette();
  const session = useSession();
  const viewerId = session.kind === "signed-in" ? session.session.user.id : null;
  const { setLiked } = useShadowWriter();
  const toggle = useToggleQueue({
    run: (on) => (viewerId ? setLike(viewerId, post.id, on) : Promise.resolve(fail("Sign in first."))),
    onSettled: (liked) => setLiked(post.id, liked),
    onError: (message, on) => Alert.alert(on ? "Couldn't like this post" : "Couldn't remove your like", message),
  });
  const colour = post.liked ? palette.primary : palette.inkMuted;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={post.liked ? "Unlike" : "Like"}
      accessibilityValue={{ text: count(post.likes, "like") }}
      accessibilityState={{ selected: post.liked }}
      onPress={() => {
        setLiked(post.id, !post.liked);
        toggle(!post.liked, post.liked);
      }}
      hitSlop={6}
      style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 5, minWidth: 44, height: 44, paddingHorizontal: 12, borderRadius: 22, backgroundColor: pressed ? palette.wash : "transparent" })}
    >
      <Heart size={size} color={colour} fill={post.liked ? colour : "none"} strokeWidth={1.9} />
      {post.likes > 0 ? (
        <Text variant="meta" tone={post.liked ? "primary" : "muted"} style={post.liked ? { fontFamily: font.monoMedium } : undefined}>
          {compact(post.likes)}
        </Text>
      ) : null}
    </Pressable>
  );
}
