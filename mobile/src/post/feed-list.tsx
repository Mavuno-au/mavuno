import { useIsFocused } from "expo-router";
import { ArrowUp, CloudOff } from "lucide-react-native";
import { useCallback, useEffect, useRef, type ReactElement, type ReactNode } from "react";
import { ActivityIndicator, FlatList, Pressable, RefreshControl, useWindowDimensions, View } from "react-native";
import type { PostRow as Row } from "@/lib/domain";
import { count } from "@/lib/format";
import type { FeedState } from "@/data/use-feed";
import { PostRow } from "@/post/post-row";
import { EndOfList, FeedSkeleton, LoadFailed } from "@/ui/controls";
import { usePullToRefresh } from "@/ui/list";
import { font, Text } from "@/ui/text";
import { usePalette } from "@/ui/theme";
import { useToastFloor } from "@/ui/toast";
import { onSoftReset } from "@/util/events";

type Props = {
  feed: { state: FeedState; loadMore: () => void; refresh: () => void; retry: () => void };
  empty: ReactNode;
  end?: string;
  header?: ReactElement;
  // Pinned rows shown before the feed, such as a profile's pinned post.
  leading?: Row[];
  // Only the list on screen answers a tap on the status bar or a soft reset.
  active?: boolean;
  showPreviews?: boolean;
  // How many posts are newer than the top of the list, offered in a pill (use-new-posts.ts).
  fresh?: number;
  // The profile's pinned post, whose menu offers Unpin.
  pinnedId?: string;
};

export function FeedList({ feed, empty, end = "You're all caught up.", header, leading = [], active = true, showPreviews = true, fresh = 0, pinnedId }: Props) {
  const { state, loadMore, refresh, retry } = feed;
  const palette = usePalette();
  const { height } = useWindowDimensions();
  const list = useRef<FlatList<Row>>(null);
  const ready = state.kind === "ready" ? state : null;
  const leadingIds = new Set(leading.map((row) => row.id));
  const rows = ready ? [...leading, ...ready.posts.filter((row) => !leadingIds.has(row.id))] : [];

  const toTop = useCallback(() => {
    list.current?.scrollToOffset({ offset: 0, animated: true });
    refresh();
  }, [refresh]);

  // Only the list on screen in the tab you're in answers.
  const focused = useIsFocused();
  useEffect(() => (active && focused ? onSoftReset(toTop) : undefined), [active, focused, toTop]);
  const pull = usePullToRefresh(ready?.refreshing ?? false, refresh);

  return (
    <View style={{ flex: 1 }}>
      <FlatList
        ref={list}
        data={rows}
        keyExtractor={(row) => row.id}
        renderItem={({ item }) => <PostRow row={item} previews={showPreviews ? ready?.previews[item.id] : undefined} pinnedHere={item.id === pinnedId} />}
        ListHeaderComponent={header}
        ListEmptyComponent={
          state.kind === "loading" ? (
            <FeedSkeleton />
          ) : state.kind === "failed" ? (
            <LoadFailed title="Couldn't load posts" reason={state.reason} onRetry={retry} />
          ) : (
            <>{empty}</>
          )
        }
        ListFooterComponent={ready && rows.length > 0 ? <Footer more={ready.more} next={ready.next} end={end} onRetry={loadMore} /> : undefined}
        onEndReached={loadMore}
        onEndReachedThreshold={2}
        refreshControl={ready ? <RefreshControl {...pull} tintColor={palette.inkMuted} /> : undefined}
        scrollsToTop={active && focused}
        indicatorStyle={palette.dark ? "white" : "black"}
        // Bluesky's settings: enough rows rendered to fill the screen at
        // about 100 points each, a short render batch so scrolling stays
        // smooth, and a list at least half again as tall as the window so
        // pull to refresh works when there are only a few posts. The tab
        // bar already sits above the home indicator, so no inset is added.
        initialNumToRender={Math.ceil(height / 100)}
        maxToRenderPerBatch={5}
        windowSize={9}
        contentContainerStyle={{ flexGrow: 1, minHeight: height * 1.5, paddingBottom: ready?.stale ? 80 : 0 }}
        style={{ backgroundColor: palette.surface }}
      />
      {fresh > 0 ? <NewPostsPill count={fresh} onPress={toTop} /> : null}
      {ready?.stale ? <OfflineNotice onRetry={refresh} active={active} /> : null}
    </View>
  );
}

function Footer({ more, next, end, onRetry }: { more: "idle" | "loading" | "failed"; next: string | null; end: string; onRetry: () => void }) {
  const palette = usePalette();
  if (more === "loading") return <ActivityIndicator style={{ paddingVertical: 24 }} color={palette.inkMuted} accessibilityLabel="Loading more posts" />;
  if (more === "failed") {
    return (
      <View accessibilityRole="alert" style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 20, flexWrap: "wrap" }}>
        <Text variant="subhead" tone="muted">
          Couldn't load more posts.
        </Text>
        <Pressable accessibilityRole="button" onPress={onRetry} hitSlop={10}>
          <Text variant="subhead" tone="primary" style={{ fontFamily: font.medium }}>
            Try again
          </Text>
        </Pressable>
      </View>
    );
  }
  return next ? null : <EndOfList>{end}</EndOfList>;
}

// Floats over the top of the list until it is tapped or the list refreshes.
function NewPostsPill({ count: total, onPress }: { count: number; onPress: () => void }) {
  const palette = usePalette();
  return (
    <View pointerEvents="box-none" style={{ position: "absolute", top: 10, left: 0, right: 0, alignItems: "center" }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${count(total, "new post")}. Show them`}
        onPress={onPress}
        style={({ pressed }) => ({
          flexDirection: "row",
          alignItems: "center",
          gap: 6,
          minHeight: 40,
          paddingLeft: 14,
          paddingRight: 16,
          borderRadius: 20,
          backgroundColor: palette.primary,
          opacity: pressed ? 0.85 : 1,
          shadowColor: "#000",
          shadowOpacity: 0.18,
          shadowRadius: 10,
          shadowOffset: { width: 0, height: 6 },
        })}
      >
        <ArrowUp size={16} color={palette.primaryInk} strokeWidth={2.4} />
        <Text variant="label" tone="primaryInk" maxFontSizeMultiplier={1.6}>
          {count(total, "new post")}
        </Text>
      </Pressable>
    </View>
  );
}

// A refresh that couldn't reach the server keeps the posts already shown.
// Toasts rise above it rather than covering it.
function OfflineNotice({ onRetry, active }: { onRetry: () => void; active: boolean }) {
  const palette = usePalette();
  const floor = useToastFloor(active);
  return (
    <View
      {...floor}
      accessibilityRole="alert"
      style={{
        position: "absolute",
        left: 12,
        right: 12,
        bottom: 12,
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        paddingVertical: 10,
        paddingLeft: 14,
        paddingRight: 10,
        borderRadius: 14,
        backgroundColor: palette.wash,
        shadowColor: "#000",
        shadowOpacity: 0.14,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 8 },
      }}
    >
      <CloudOff size={18} color={palette.inkMuted} />
      <Text variant="subhead" style={{ flex: 1 }}>
        Couldn't reach Mavuno. Showing posts from earlier.
      </Text>
      <Pressable
        accessibilityRole="button"
        onPress={onRetry}
        style={({ pressed }) => ({ minHeight: 36, paddingHorizontal: 12, borderRadius: 18, justifyContent: "center", backgroundColor: pressed ? palette.hairline : palette.surface })}
      >
        <Text variant="subhead" tone="primary" style={{ fontFamily: font.semibold }}>
          Try again
        </Text>
      </Pressable>
    </View>
  );
}
