import { Bookmark } from "lucide-react-native";
import { View } from "react-native";
import { loadFeed } from "@/data/posts";
import { useFeed } from "@/data/use-feed";
import { FeedList } from "@/post/feed-list";
import { EmptyState } from "@/ui/controls";
import { BackButton, Header } from "@/ui/header";
import { Text } from "@/ui/text";
import { usePalette } from "@/ui/theme";

// Private to you, as on the website; the filled bookmark on a post removes it.
export default function Saved() {
  const palette = usePalette();
  const feed = useFeed((cursor) => loadFeed({ kind: "saved" }, cursor), "saved");
  return (
    <View style={{ flex: 1, backgroundColor: palette.surface }}>
      <Header title="Saved posts" left={<BackButton />} />
      <FeedList
        feed={feed}
        header={
          <Text variant="small" tone="muted" style={{ paddingHorizontal: 16, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: palette.hairline }}>
            Only you can see what you've saved.
          </Text>
        }
        end="That's everything you've saved."
        empty={
          <EmptyState icon={<Bookmark size={26} color={palette.inkMuted} />} title="Nothing saved yet">
            Tap the bookmark on a post to keep it here for later.
          </EmptyState>
        }
      />
    </View>
  );
}
