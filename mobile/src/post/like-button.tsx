import { Heart } from "lucide-react-native";
import { useState } from "react";
import { Animated, Pressable } from "react-native";
import type { Post } from "@/lib/domain";
import { compact, count } from "@/lib/format";
import { fail } from "@/lib/result";
import { setLike } from "@/data/posts";
import { useSession } from "@/data/session";
import { useShadowWriter } from "@/data/shadow";
import { font, Text } from "@/ui/text";
import { usePalette } from "@/ui/theme";
import { toast } from "@/ui/toast";
import { haptics } from "@/util/haptics";
import { useReduceMotion } from "@/util/motion";
import { useToggleQueue } from "@/util/toggle-queue";

// The heart fills the moment it is tapped; the server hears in turn
// (toggle-queue.ts), and if it says no the heart empties again.
// `post` is the row as the shadow shows it, so the seed is what is on screen.
export function LikeButton({ post, size }: { post: Post; size: number }) {
  const palette = usePalette();
  const session = useSession();
  const reduceMotion = useReduceMotion();
  const [scale] = useState(() => new Animated.Value(1));
  const viewerId = session.kind === "signed-in" ? session.session.user.id : null;
  const { setLiked } = useShadowWriter();
  const toggle = useToggleQueue({
    run: (on) => (viewerId ? setLike(viewerId, post.id, on) : Promise.resolve(fail("Sign in first."))),
    onSettled: (liked) => setLiked(post.id, liked),
    onError: (message, on) => toast(`${on ? "Couldn't like this post" : "Couldn't remove your like"}. ${message}`, { tone: "error" }),
  });
  const colour = post.liked ? palette.primary : palette.inkMuted;

  // A like is felt as well as seen: the heart gives a small bounce, as on
  // Bluesky, unless the reader has asked for less motion.
  function bounce() {
    if (reduceMotion) return;
    scale.setValue(0.7);
    Animated.spring(scale, { toValue: 1, friction: 3, tension: 180, useNativeDriver: true }).start();
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={post.liked ? "Unlike" : "Like"}
      accessibilityValue={{ text: count(post.likes, "like") }}
      accessibilityState={{ selected: post.liked }}
      onPress={() => {
        haptics.tap();
        if (!post.liked) bounce();
        setLiked(post.id, !post.liked);
        toggle(!post.liked, post.liked);
      }}
      hitSlop={6}
      style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 5, minWidth: 44, height: 44, paddingHorizontal: 10, borderRadius: 22, backgroundColor: pressed ? palette.wash : "transparent" })}
    >
      <Animated.View style={{ transform: [{ scale }] }}>
        <Heart size={size} color={colour} fill={post.liked ? colour : "none"} strokeWidth={1.9} />
      </Animated.View>
      {post.likes > 0 ? (
        <Text variant="meta" tone={post.liked ? "primary" : "muted"} style={post.liked ? { fontFamily: font.monoMedium } : undefined}>
          {compact(post.likes)}
        </Text>
      ) : null}
    </Pressable>
  );
}
