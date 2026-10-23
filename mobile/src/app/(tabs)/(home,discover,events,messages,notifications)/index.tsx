import { router } from "expo-router";
import { Rss, SquarePen, UserPlus } from "lucide-react-native";
import { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, View } from "react-native";
import PagerView from "react-native-pager-view";
import { feedTime } from "@/lib/feeds";
import { loadFeed, newTrendingSeed } from "@/data/posts";
import { usePreferences } from "@/data/preferences";
import { useViewer } from "@/data/session";
import { useFeed, type FeedState } from "@/data/use-feed";
import { setFollowingFresh, useNewPosts, type FeedKind } from "@/data/use-new-posts";
import { useSuggestions, WhoToFollow } from "@/people/who-to-follow";
import { FeedList } from "@/post/feed-list";
import { Avatar } from "@/ui/avatar";
import { Wordmark } from "@/ui/brand";
import { Button, EmptyState, IconButton, Segmented } from "@/ui/controls";
import { Header } from "@/ui/header";
import { HAIRLINE, usePalette } from "@/ui/theme";
import { emitSoftReset } from "@/util/events";
import { haptics } from "@/util/haptics";

type HomeFeed = FeedKind | "trending";

// Following and Latest show every top-level post the member makes.
const everyPost = () => true;

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

function withDismiss(list: ReturnType<typeof useFeed>, dismiss: () => void) {
  return {
    ...list,
    refresh: () => {
      dismiss();
      list.refresh();
    },
  };
}

export default function Home() {
  const palette = usePalette();
  const viewer = useViewer();
  const [feed, setFeed] = useState<HomeFeed>("following");
  // Latest and Trending load the first time they are shown; after that all
  // stay mounted, so switching back keeps each one's place.
  const [opened, setOpened] = useState<ReadonlySet<HomeFeed>>(new Set(["following"]));
  // Trending is drawn afresh on each refresh, weighted by conversation.
  // Kept out of the feed's key, so a redraw keeps the posts on screen while
  // the new draw loads, and keeps them if it fails.
  const seed = useRef(newTrendingSeed());
  const following = useFeed((cursor) => loadFeed({ kind: "following" }, cursor), "following", { takesPosts: everyPost });
  const latest = useFeed((cursor) => loadFeed({ kind: "latest" }, cursor), "latest", { enabled: opened.has("latest"), takesPosts: everyPost });
  const trending = useFeed((cursor) => loadFeed({ kind: "trending", seed: seed.current }, cursor), "trending", { enabled: opened.has("trending") });
  const [followingFresh, dismissFollowing] = useNewPosts({ feed: "following", ...checkable(following.state), active: feed === "following", away: true });
  const [latestFresh, dismissLatest] = useNewPosts({ feed: "latest", ...checkable(latest.state), active: feed === "latest" });
  useEffect(() => setFollowingFresh(followingFresh > 0), [followingFresh]);
  useEffect(() => () => setFollowingFresh(false), []);

  // Trending leaves it out, as on the website. What each list is given is
  // memoised, so a change to one feed doesn't render the others' rows again.
  const { whoToFollow } = usePreferences();
  const viewerId = viewer && whoToFollow ? viewer.id : null;
  const people = useSuggestions(viewerId);
  const suggestions = useMemo(() => (viewerId ? { after: 5, node: <WhoToFollow viewerId={viewerId} suggestions={people} /> } : undefined), [viewerId, people]);

  // A refresh, however it starts, answers the new-posts pill.
  const followingFeed = useMemo(() => withDismiss(following, dismissFollowing), [following, dismissFollowing]);
  const latestFeed = useMemo(() => withDismiss(latest, dismissLatest), [latest, dismissLatest]);
  // Refreshing Trending draws it again.
  const redraw = useMemo(
    () => ({
      ...trending,
      refresh: () => {
        seed.current = newTrendingSeed();
        trending.refresh();
      },
    }),
    [trending],
  );

  // The feeds sit side by side, so a swipe moves between them as on Bluesky
  // and the website. A feed reached for the first time starts loading.
  const pager = useRef<PagerView>(null);
  const select = (next: HomeFeed) => {
    setFeed(next);
    setOpened((current) => (current.has(next) ? current : new Set([...current, next])));
  };
  // Tapping the feed already shown scrolls it back to the top and refreshes it.
  const show = (next: HomeFeed) => {
    if (next === feed) return emitSoftReset();
    pager.current?.setPage(FEEDS.findIndex((option) => option.key === next));
    select(next);
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
      <PagerView
        ref={pager}
        style={{ flex: 1 }}
        initialPage={0}
        onPageSelected={(event) => {
          const next = FEEDS[event.nativeEvent.position]?.key;
          if (next && next !== feed) select(next);
        }}
      >
        <View key="following" style={{ flex: 1 }}>
          <FeedList
            feed={followingFeed}
            active={feed === "following"}
            fresh={followingFresh}
            insert={suggestions}
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
        <View key="latest" style={{ flex: 1 }}>
          {opened.has("latest") ? (
            <FeedList feed={latestFeed} active={feed === "latest"} fresh={latestFresh} insert={suggestions} empty={<EmptyState title="Nothing here yet">Be the first to post something.</EmptyState>} />
          ) : null}
        </View>
        <View key="trending" style={{ flex: 1 }}>
          {opened.has("trending") ? (
            <FeedList feed={redraw} active={feed === "trending"} empty={<EmptyState title="Nothing trending yet">Posts with the most conversation this week show here.</EmptyState>} />
          ) : null}
        </View>
      </PagerView>
    </View>
  );
}
