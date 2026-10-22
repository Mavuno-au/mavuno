import { router, useLocalSearchParams } from "expo-router";
import { Hash, SquarePen } from "lucide-react-native";
import { View } from "react-native";
import { z } from "zod";
import { loadFeed } from "@/data/posts";
import { useFeed } from "@/data/use-feed";
import { FeedList } from "@/post/feed-list";
import { EmptyState, IconButton } from "@/ui/controls";
import { BackButton, Header } from "@/ui/header";
import { usePalette } from "@/ui/theme";

// Every #topic has its own page of posts, newest first, as on the website.
export default function Topic() {
  const palette = usePalette();
  const topic = z
    .string()
    .regex(/^[a-z][a-z0-9_]{1,39}$/)
    .safeParse(String(useLocalSearchParams().topic ?? "").toLowerCase()).data;
  const feed = useFeed((cursor) => loadFeed({ kind: "topic", topic: topic ?? "" }, cursor), `topic:${topic ?? ""}`, { enabled: Boolean(topic), takesPosts: true });
  return (
    <View style={{ flex: 1, backgroundColor: palette.surface }}>
      <Header
        title={topic ? `#${topic}` : "Topic"}
        left={<BackButton fallback="/discover" />}
        right={
          topic ? (
            <IconButton label={`Write a post about #${topic}`} onPress={() => router.push({ pathname: "/compose", params: { text: `#${topic} ` } })}>
              <SquarePen size={19} color={palette.ink} />
            </IconButton>
          ) : undefined
        }
      />
      {topic ? (
        <FeedList feed={feed} end="That's every post with this topic." empty={<EmptyState icon={<Hash size={26} color={palette.inkMuted} />} title={`No posts with #${topic} yet`}>Be the first to post about it.</EmptyState>} />
      ) : (
        <EmptyState title="That isn't a topic">Topics are a # followed by letters, numbers or underscores.</EmptyState>
      )}
    </View>
  );
}
