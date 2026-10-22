import { Redirect, router } from "expo-router";
import { Rss } from "lucide-react-native";
import { useState } from "react";
import { Pressable, View } from "react-native";
import { loadFeed, type FeedKind } from "@/data/posts";
import { useSession, useViewer } from "@/data/session";
import { useFeed } from "@/data/use-feed";
import { FeedList } from "@/post/feed-list";
import { Avatar } from "@/ui/avatar";
import { Wordmark } from "@/ui/brand";
import { Button, EmptyState, Segmented } from "@/ui/controls";
import { Header } from "@/ui/header";
import { usePalette } from "@/ui/theme";

const FEEDS = [
  { key: "following", label: "Following" },
  { key: "latest", label: "Latest" },
] as const satisfies readonly { key: FeedKind; label: string }[];

// The app opens here. Signed out, that means Welcome.
export default function Index() {
  const session = useSession();
  if (session.kind !== "signed-in") return <Redirect href="/welcome" />;
  return <Home />;
}

function Home() {
  const palette = usePalette();
  const viewer = useViewer();
  const [feed, setFeed] = useState<FeedKind>("following");
  // Latest loads the first time it is shown; after that both stay mounted, so
  // switching back keeps each one's place.
  const [opened, setOpened] = useState<ReadonlySet<FeedKind>>(new Set(["following"]));
  const following = useFeed((cursor) => loadFeed({ kind: "following" }, cursor), "following");
  const latest = useFeed((cursor) => loadFeed({ kind: "latest" }, cursor), "latest", { enabled: opened.has("latest") });

  const show = (next: FeedKind) => {
    setFeed(next);
    setOpened((current) => new Set([...current, next]));
  };

  return (
    <View style={{ flex: 1, backgroundColor: palette.surface }}>
      <Header
        left={
          viewer ? (
            <Pressable accessibilityRole="button" accessibilityLabel="Your profile" onPress={() => router.push(`/profile/${viewer.username}`)} style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}>
              <Avatar person={viewer} size={36} />
            </Pressable>
          ) : null
        }
      >
        <Wordmark />
      </Header>
      <View style={{ paddingHorizontal: 16, paddingTop: 4, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: palette.hairline, backgroundColor: palette.surface }}>
        <Segmented label="Feeds" options={FEEDS} value={feed} onChange={show} />
      </View>
      <View style={{ flex: 1, display: feed === "following" ? "flex" : "none" }}>
        <FeedList
          feed={following}
          active={feed === "following"}
          empty={
            <EmptyState
              icon={<Rss size={26} color={palette.inkMuted} />}
              title="Your feed is quiet"
              action={<Button label="Browse Latest" size="medium" onPress={() => show("latest")} />}
            >
              Follow people and organisations to see their posts here, or browse the latest posts.
            </EmptyState>
          }
        />
      </View>
      {opened.has("latest") ? (
        <View style={{ flex: 1, display: feed === "latest" ? "flex" : "none" }}>
          <FeedList feed={latest} active={feed === "latest"} empty={<EmptyState title="Nothing here yet">Be the first to post something.</EmptyState>} />
        </View>
      ) : null}
    </View>
  );
}
