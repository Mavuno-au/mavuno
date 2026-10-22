import { router } from "expo-router";
import { Rss, SquarePen, UserPlus } from "lucide-react-native";
import { useEffect, useState } from "react";
import { Pressable, View } from "react-native";
import { feedTime } from "@/lib/feeds";
import { loadFeed, newTrendingSeed } from "@/data/posts";
import { useViewer } from "@/data/session";
import { useFeed, type FeedState } from "@/data/use-feed";
import { setFollowingFresh, useNewPosts, type FeedKind } from "@/data/use-new-posts";
import { FeedList } from "@/post/feed-list";
import { Avatar } from "@/ui/avatar";
import { Wordmark } from "@/ui/brand";
import { Button, EmptyState, IconButton, Segmented } from "@/ui/controls";
import { Header } from "@/ui/header";
import { HAIRLINE, usePalette } from "@/ui/theme";
import { emitSoftReset } from "@/util/events";
import { haptics } from "@/util/haptics";

type HomeFeed = FeedKind | "trending";

const FEEDS = [
  { key: "following", label: "Following" },
  { key: "latest", label: "Latest" },
  { key: "trending", label: "Trending" },
] as const satisfies readonly { key: HomeFeed; label: string }[];

// What the new-posts check needs from a feed: when its newest post was
// published, and whether it is busy reading.
function checkable(state: FeedState) {
  const top = state.kind === "ready" ? state.posts[0] : undefined;
  return { since: top ? feedTime(top) : null, busy: state.kind !== "ready" || state.refreshing };
}

export default function Home() {
  const palette = usePalette();
  const viewer = useViewer();
  const [feed, setFeed] = useState<HomeFeed>("following");
  // Latest and Trending load the first time they are shown; after that all
  // stay mounted, so switching back keeps each one's place.
  const [opened, setOpened] = useState<ReadonlySet<HomeFeed>>(new Set(["following"]));
  // Trending is drawn afresh on each visit, weighted by conversation.
  const [seed, setSeed] = useState(newTrendingSeed);
  const following = useFeed((cursor) => loadFeed({ kind: "following" }, cursor), "following", { takesPosts: true });
  const latest = useFeed((cursor) => loadFeed({ kind: "latest" }, cursor), "latest", { enabled: opened.has("latest"), takesPosts: true });
  const trending = useFeed((cursor) => loadFeed({ kind: "trending", seed }, cursor), `trending:${seed}`, { enabled: opened.has("trending") });
  const [followingFresh, dismissFollowing] = useNewPosts({ feed: "following", ...checkable(following.state), active: feed === "following", away: true });
  const [latestFresh, dismissLatest] = useNewPosts({ feed: "latest", ...checkable(latest.state), active: feed === "latest" });
  useEffect(() => setFollowingFresh(followingFresh > 0), [followingFresh]);
  useEffect(() => () => setFollowingFresh(false), []);

  // A refresh, however it starts, answers the new-posts pill.
  const withDismiss = (list: typeof following, dismiss: () => void) => ({
    ...list,
    refresh: () => {
      dismiss();
      list.refresh();
    },
  });
  // Refreshing Trending draws it again.
  const redraw = { ...trending, refresh: () => setSeed(newTrendingSeed()) };

  // Tapping the feed already shown scrolls it back to the top and refreshes it.
  const show = (next: HomeFeed) => {
    if (next === feed) return emitSoftReset();
    setFeed(next);
    setOpened((current) => new Set([...current, next]));
  };

  return (
    <View style={{ flex: 1, backgroundColor: palette.surface }}>
      <Header
        border={false}
        left={
          viewer ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Your profile and settings"
              onPress={() => router.push(`/profile/${viewer.username}`)}
              style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}
            >
              <Avatar person={viewer} size={36} />
            </Pressable>
          ) : null
        }
        right={
          <>
            <IconButton label="Invite friends" onPress={() => router.push("/invite")}>
              <UserPlus size={19} color={palette.ink} strokeWidth={2} />
            </IconButton>
            <IconButton label="Write a post" onPress={() => router.push("/compose")}>
              <SquarePen size={19} color={palette.ink} strokeWidth={2} />
            </IconButton>
          </>
        }
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Mavuno"
          accessibilityHint="Scrolls to the top"
          onPress={() => {
            haptics.tap();
            emitSoftReset();
          }}
          hitSlop={8}
          style={({ pressed }) => ({ transform: [{ scale: pressed ? 0.94 : 1 }] })}
        >
          <Wordmark />
        </Pressable>
      </Header>
      <View style={{ paddingHorizontal: 16, paddingTop: 4, paddingBottom: 8, borderBottomWidth: HAIRLINE, borderBottomColor: palette.hairline, backgroundColor: palette.surface }}>
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
              action={
                <View style={{ gap: 10, alignItems: "center" }}>
                  <Button label="Browse Latest" size="medium" onPress={() => show("latest")} />
                  <Button label="Bring your friends" size="medium" variant="outline" onPress={() => router.push("/invite")} />
                </View>
              }
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
      {opened.has("trending") ? (
        <View style={{ flex: 1, display: feed === "trending" ? "flex" : "none" }}>
          <FeedList feed={redraw} active={feed === "trending"} empty={<EmptyState title="Nothing trending yet">Posts with the most conversation this week show here.</EmptyState>} />
        </View>
      ) : null}
    </View>
  );
}
