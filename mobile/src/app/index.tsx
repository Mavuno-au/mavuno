import { Redirect, router } from "expo-router";
import { Rss } from "lucide-react-native";
import { useState } from "react";
import { Pressable, View } from "react-native";
import { feedTime } from "@/lib/feeds";
import { loadFeed, type FeedKind } from "@/data/posts";
import { useSession, useViewer } from "@/data/session";
import { useFeed, type FeedState } from "@/data/use-feed";
import { useNewPosts } from "@/data/use-new-posts";
import { FeedList } from "@/post/feed-list";
import { Avatar } from "@/ui/avatar";
import { Wordmark } from "@/ui/brand";
import { Button, EmptyState, Segmented } from "@/ui/controls";
import { Header } from "@/ui/header";
import { usePalette } from "@/ui/theme";
import { emitSoftReset } from "@/util/events";

const FEEDS = [
  { key: "following", label: "Following" },
  { key: "latest", label: "Latest" },
] as const satisfies readonly { key: FeedKind; label: string }[];

// What the new-posts check needs from a feed: when its newest post was
// published, and whether it is busy reading.
function checkable(state: FeedState) {
  const top = state.kind === "ready" ? state.posts[0] : undefined;
  return { since: top ? feedTime(top) : null, busy: state.kind !== "ready" || state.refreshing };
}

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
  const [followingFresh, dismissFollowing] = useNewPosts({ feed: "following", ...checkable(following.state), active: feed === "following" });
  const [latestFresh, dismissLatest] = useNewPosts({ feed: "latest", ...checkable(latest.state), active: feed === "latest" });
  // A refresh, however it starts, answers the new-posts pill.
  const withDismiss = (list: typeof following, dismiss: () => void) => ({
    ...list,
    refresh: () => {
      dismiss();
      list.refresh();
    },
  });

  // Tapping the feed already shown scrolls it back to the top and refreshes it.
  const show = (next: FeedKind) => {
    if (next === feed) return emitSoftReset();
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
        <Pressable accessibilityRole="button" accessibilityLabel="Mavuno" accessibilityHint="Scrolls to the top" onPress={emitSoftReset} hitSlop={8}>
          <Wordmark />
        </Pressable>
      </Header>
      <View style={{ paddingHorizontal: 16, paddingTop: 4, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: palette.hairline, backgroundColor: palette.surface }}>
        <Segmented label="Feeds" options={FEEDS} value={feed} onChange={show} />
      </View>
      <View style={{ flex: 1, display: feed === "following" ? "flex" : "none" }}>
        <FeedList
          feed={withDismiss(following, dismissFollowing)}
          active={feed === "following"}
          fresh={followingFresh}
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
          <FeedList feed={withDismiss(latest, dismissLatest)} active={feed === "latest"} fresh={latestFresh} empty={<EmptyState title="Nothing here yet">Be the first to post something.</EmptyState>} />
        </View>
      ) : null}
    </View>
  );
}
