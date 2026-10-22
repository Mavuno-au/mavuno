import { CloudOff } from "lucide-react-native";
import type { ReactElement, ReactNode } from "react";
import { ActivityIndicator, FlatList, Pressable, RefreshControl, View, type ListRenderItem } from "react-native";
import { PROBLEM } from "@/data/errors";
import type { ListState } from "@/data/use-list";
import { Button, EmptyState, EndOfList } from "@/ui/controls";
import { font, Text } from "@/ui/text";
import { usePalette } from "@/ui/theme";

// A paged list with the same loading, failure, empty and end states as feeds.
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
  const { state } = list;
  const ready = state.kind === "ready" ? state : null;
  return (
    <FlatList
      data={ready?.items ?? []}
      keyExtractor={(item) => item.id}
      renderItem={renderItem}
      ListHeaderComponent={header}
      ListEmptyComponent={
        state.kind === "loading" ? (
          <>{skeleton ?? <ActivityIndicator style={{ paddingVertical: 40 }} color={palette.inkMuted} />}</>
        ) : state.kind === "failed" ? (
          <EmptyState icon={<CloudOff size={26} color={palette.inkMuted} />} title={failedTitle} action={<Button label="Try again" size="medium" onPress={list.retry} />}>
            {PROBLEM[state.reason]}
          </EmptyState>
        ) : (
          <>{empty}</>
        )
      }
      ListFooterComponent={
        ready && ready.items.length > 0 ? (
          ready.more === "loading" ? (
            <ActivityIndicator style={{ paddingVertical: 24 }} color={palette.inkMuted} />
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
      onEndReached={list.loadMore}
      onEndReachedThreshold={1.5}
      refreshControl={ready ? <RefreshControl refreshing={ready.refreshing} onRefresh={list.refresh} tintColor={palette.inkMuted} /> : undefined}
      contentContainerStyle={{ flexGrow: 1 }}
      style={{ backgroundColor: palette.surface }}
    />
  );
}
