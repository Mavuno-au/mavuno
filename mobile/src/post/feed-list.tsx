import { CloudOff } from "lucide-react-native";
import type { ReactElement, ReactNode } from "react";
import { ActivityIndicator, FlatList, Pressable, RefreshControl, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { PostRow as Row } from "@/lib/domain";
import type { FeedState } from "@/data/use-feed";
import { PostRow } from "@/post/post-row";
import { Button, EmptyState, EndOfList, FeedSkeleton } from "@/ui/controls";
import { font, Text } from "@/ui/text";
import { usePalette } from "@/ui/theme";

type Props = {
  feed: { state: FeedState; loadMore: () => void; refresh: () => void; retry: () => void };
  empty: ReactNode;
  end?: string;
  header?: ReactElement;
  // Pinned rows shown before the feed, such as a profile's pinned post.
  leading?: Row[];
  // Only the list on screen answers a tap on the status bar.
  active?: boolean;
  showPreviews?: boolean;
};

export function FeedList({ feed, empty, end = "You're all caught up.", header, leading = [], active = true, showPreviews = true }: Props) {
  const { state, loadMore, refresh, retry } = feed;
  const palette = usePalette();
  const insets = useSafeAreaInsets();
  const ready = state.kind === "ready" ? state : null;
  const leadingIds = new Set(leading.map((row) => row.id));
  const rows = ready ? [...leading, ...ready.posts.filter((row) => !leadingIds.has(row.id))] : [];

  return (
    <View style={{ flex: 1 }}>
      <FlatList
        data={rows}
        keyExtractor={(row) => row.id}
        renderItem={({ item }) => <PostRow row={item} previews={showPreviews ? ready?.previews[item.id] : undefined} />}
        ListHeaderComponent={header}
        ListEmptyComponent={
          state.kind === "loading" ? (
            <FeedSkeleton />
          ) : state.kind === "failed" ? (
            <EmptyState icon={<CloudOff size={26} color={palette.inkMuted} />} title="Couldn't load posts" action={<Button label="Try again" size="medium" onPress={retry} />}>
              Check your connection, then try again.
            </EmptyState>
          ) : (
            <>{empty}</>
          )
        }
        ListFooterComponent={ready && rows.length > 0 ? <Footer more={ready.more} next={ready.next} end={end} onRetry={loadMore} /> : undefined}
        onEndReached={loadMore}
        onEndReachedThreshold={2}
        refreshControl={state.kind === "ready" ? <RefreshControl refreshing={state.refreshing} onRefresh={refresh} tintColor={palette.inkMuted} /> : undefined}
        scrollsToTop={active}
        indicatorStyle={palette.dark ? "white" : "black"}
        contentContainerStyle={{ flexGrow: 1, paddingBottom: insets.bottom + (ready?.stale ? 80 : 0) }}
        style={{ backgroundColor: palette.surface }}
      />
      {ready?.stale ? <OfflineNotice onRetry={refresh} /> : null}
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

// A refresh that couldn't reach the server keeps the posts already shown.
function OfflineNotice({ onRetry }: { onRetry: () => void }) {
  const palette = usePalette();
  const insets = useSafeAreaInsets();
  return (
    <View
      accessibilityRole="alert"
      style={{
        position: "absolute",
        left: 12,
        right: 12,
        bottom: insets.bottom + 12,
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
