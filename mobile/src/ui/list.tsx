import { useState, type ReactElement, type ReactNode } from "react";
import { ActivityIndicator, FlatList, Pressable, RefreshControl, View, type ListRenderItem } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { ListState } from "@/data/use-list";
import { EndOfList, LoadFailed, RowSkeleton } from "@/ui/controls";
import { font, Text } from "@/ui/text";
import { usePalette } from "@/ui/theme";

// The spinner shows only for a refresh the reader pulled for. A tap on the
// tab, the feed's name or the new-posts pill refreshes the list without it,
// as Bluesky does, so the list doesn't jump down under a spinner.
export function usePullToRefresh(refreshing: boolean, refresh: () => void) {
  const [pulled, setPulled] = useState(false);
  if (pulled && !refreshing) setPulled(false);
  return {
    refreshing: pulled && refreshing,
    onRefresh: () => {
      setPulled(true);
      refresh();
    },
  };
}

// A paged list with the same loading, failure, empty and end states as feeds.
// While it loads it shows rows of people unless `skeleton` says otherwise.
export function PagedList<Item extends { id: string }>({
  list,
  renderItem,
  empty,
  header,
  end,
  skeleton,
  failedTitle = "This didn't load",
}: {
  list: { state: ListState<Item>; loadMore: () => void; refresh: () => void; retry: () => void };
  renderItem: ListRenderItem<Item>;
  empty: ReactNode;
  header?: ReactElement;
  end?: string;
  skeleton?: ReactNode;
  failedTitle?: string;
}) {
  const palette = usePalette();
  const insets = useSafeAreaInsets();
  const { state } = list;
  const ready = state.kind === "ready" ? state : null;
  const pull = usePullToRefresh(ready?.refreshing ?? false, list.refresh);
  return (
    <FlatList
      data={ready?.items ?? []}
      keyExtractor={(item) => item.id}
      renderItem={renderItem}
      ListHeaderComponent={header}
      ListEmptyComponent={
        state.kind === "loading" ? (
          <>{skeleton ?? <RowSkeleton />}</>
        ) : state.kind === "failed" ? (
          <LoadFailed title={failedTitle} reason={state.reason} onRetry={list.retry} />
        ) : (
          <>{empty}</>
        )
      }
      ListFooterComponent={
        ready && ready.items.length > 0 ? (
          ready.more === "loading" ? (
            <ActivityIndicator style={{ paddingVertical: 24 }} color={palette.inkMuted} accessibilityLabel="Loading more" />
          ) : ready.more === "failed" ? (
            <Pressable accessibilityRole="button" onPress={list.loadMore} style={{ minHeight: 56, alignItems: "center", justifyContent: "center" }}>
              <Text variant="subhead" tone="primary" style={{ fontFamily: font.medium }}>
                Couldn't load more. Try again.
              </Text>
            </Pressable>
          ) : !ready.next && end ? (
            <EndOfList>{end}</EndOfList>
          ) : (
            <View style={{ height: 24 }} />
          )
        ) : undefined
      }
      // A failed page waits for Try again: the footer changes height when it fails, which would fire this again at once.
      onEndReached={ready?.more === "failed" ? undefined : list.loadMore}
      onEndReachedThreshold={1.5}
      refreshControl={ready ? <RefreshControl {...pull} tintColor={palette.inkMuted} /> : undefined}
      contentContainerStyle={{ flexGrow: 1, paddingLeft: insets.left, paddingRight: insets.right }}
      style={{ backgroundColor: palette.surface }}
    />
  );
}
