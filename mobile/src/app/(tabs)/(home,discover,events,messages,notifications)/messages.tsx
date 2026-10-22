import { router, useFocusEffect, useIsFocused } from "expo-router";
import { BellOff, Ellipsis, MessageCircle, Search, SquarePen } from "lucide-react-native";
import { useCallback, useEffect, useRef, useState } from "react";
import { FlatList, Pressable, RefreshControl, TextInput, View } from "react-native";
import { relativeTime } from "@/lib/format";
import { BOXES, boxOf, isVisible, preview, type Box, type Conversation } from "@/lib/messages";
import { useCounts } from "@/data/counts";
import { reasonOf, type Reason } from "@/data/errors";
import { loadConversations } from "@/data/messages";
import { useViewer } from "@/data/session";
import { supabase } from "@/data/supabase";
import { ConversationAvatar } from "@/messages/conversation-avatar";
import { Button, EmptyState, IconButton, LoadFailed, RowSkeleton, Segmented } from "@/ui/controls";
import { Header } from "@/ui/header";
import { ActionSheet } from "@/ui/sheet";
import { font, Text, type } from "@/ui/text";
import { HAIRLINE, usePalette } from "@/ui/theme";
import { onSoftReset } from "@/util/events";
import { timeZone, useNow } from "@/util/time";

type State = { kind: "loading" } | { kind: "failed"; reason: Reason } | { kind: "ready"; conversations: Conversation[]; refreshing: boolean };

// Inbox and Requests as a segmented control; Archived is in the ••• menu.
export default function Messages() {
  const palette = usePalette();
  const viewer = useViewer();
  const counts = useCounts();
  const focused = useIsFocused();
  const [box, setBox] = useState<Box>("inbox");
  const [state, setState] = useState<State>({ kind: "loading" });
  const [search, setSearch] = useState("");
  const [menu, setMenu] = useState(false);
  const list = useRef<FlatList<Conversation>>(null);
  const viewerId = viewer?.id ?? null;

  const read = useCallback(() => {
    loadConversations().then(
      (conversations) => setState({ kind: "ready", conversations, refreshing: false }),
      (error: unknown) => setState((current) => (current.kind === "ready" ? { ...current, refreshing: false } : { kind: "failed", reason: reasonOf(error) })),
    );
  }, []);

  // Re-read whenever the tab comes back into view; the badge then clears.
  useFocusEffect(
    useCallback(() => {
      read();
      counts.clear("messages");
    }, [read, counts]),
  );

  // A new message anywhere the viewer can read moves its conversation up,
  // at most every 3 seconds, as the website's live-inbox.tsx does.
  useEffect(() => {
    if (!viewerId) return;
    let last = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const soon = () => {
      const wait = Math.max(0, last + 3000 - Date.now());
      clearTimeout(timer);
      timer = setTimeout(() => {
        last = Date.now();
        read();
      }, wait);
    };
    const channel = supabase.channel(`inbox:${viewerId}`, { config: { private: true } }).on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, soon).subscribe();
    return () => {
      clearTimeout(timer);
      void supabase.removeChannel(channel);
    };
  }, [viewerId, read]);

  useEffect(
    () =>
      focused
        ? onSoftReset(() => {
            list.current?.scrollToOffset({ offset: 0, animated: true });
            read();
          })
        : undefined,
    [focused, read],
  );

  const visible = state.kind === "ready" && viewerId ? state.conversations.filter((conversation) => isVisible(conversation, viewerId)) : [];
  const requests = visible.filter((conversation) => boxOf(conversation) === "requests").length;
  const term = search.trim().toLowerCase();
  const shown = visible.filter((conversation) => boxOf(conversation) === box && (!term || conversation.name.toLowerCase().includes(term) || conversation.members.some((member) => member.username.toLowerCase().includes(term))));
  const empty = BOXES[box].empty;

  return (
    <View style={{ flex: 1, backgroundColor: palette.surface }}>
      <Header
        title={box === "archived" ? "Archived" : "Messages"}
        border={false}
        left={
          <IconButton label="More" onPress={() => setMenu(true)}>
            <Ellipsis size={19} color={palette.ink} />
          </IconButton>
        }
        right={
          <IconButton label="New message" onPress={() => router.push("/new-message")}>
            <SquarePen size={19} color={palette.ink} />
          </IconButton>
        }
      />
      <View style={{ paddingHorizontal: 16, paddingBottom: 8, gap: 8, borderBottomWidth: HAIRLINE, borderBottomColor: palette.hairline }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, minHeight: 40, paddingHorizontal: 12, borderRadius: 12, backgroundColor: palette.wash }}>
          <Search size={16} color={palette.inkMuted} />
          <TextInput
            accessibilityLabel="Search messages"
            placeholder="Search"
            placeholderTextColor={palette.inkMuted}
            value={search}
            onChangeText={setSearch}
            autoCorrect={false}
            clearButtonMode="while-editing"
            style={[type.body, { flex: 1, minHeight: 40, color: palette.ink }]}
          />
        </View>
        {box === "archived" ? (
          <Button label="Back to Inbox" variant="outline" size="medium" onPress={() => setBox("inbox")} />
        ) : (
          <Segmented
            label="Mailbox"
            options={[
              { key: "inbox", label: "Inbox" },
              { key: "requests", label: requests > 0 ? `Requests ${requests}` : "Requests" },
            ]}
            value={box}
            onChange={setBox}
          />
        )}
      </View>
      {box === "requests" && shown.length > 0 ? (
        <Text variant="small" tone="muted" style={{ paddingHorizontal: 16, paddingVertical: 10, backgroundColor: palette.wash }}>
          From people you don't follow. They won't know you've seen a request until you accept it.
        </Text>
      ) : null}
      <FlatList
        ref={list}
        data={shown}
        keyExtractor={(conversation) => conversation.id}
        renderItem={({ item }) => (viewerId ? <ConversationRow conversation={item} viewerId={viewerId} /> : null)}
        ListEmptyComponent={
          state.kind === "loading" ? (
            <RowSkeleton label="Loading messages" />
          ) : state.kind === "failed" ? (
            <LoadFailed title="Messages didn't load" reason={state.reason} onRetry={read} />
          ) : term ? (
            <EmptyState title={`No conversations match "${search.trim()}"`} />
          ) : (
            <EmptyState icon={<MessageCircle size={26} color={palette.inkMuted} />} title={empty.title} action={box === "inbox" ? <Button label="New message" size="medium" onPress={() => router.push("/new-message")} /> : undefined}>
              {empty.body}
            </EmptyState>
          )
        }
        refreshControl={
          state.kind === "ready" ? (
            <RefreshControl
              refreshing={state.refreshing}
              onRefresh={() => {
                setState({ ...state, refreshing: true });
                read();
              }}
              tintColor={palette.inkMuted}
            />
          ) : undefined
        }
        contentContainerStyle={{ flexGrow: 1 }}
        keyboardDismissMode="on-drag"
      />
      <ActionSheet
        title="Messages"
        open={menu}
        onClose={() => setMenu(false)}
        actions={[
          { label: "Inbox", checked: box === "inbox", onPress: () => setBox("inbox") },
          { label: requests > 0 ? `Requests (${requests})` : "Requests", checked: box === "requests", onPress: () => setBox("requests") },
          { label: "Archived", checked: box === "archived", onPress: () => setBox("archived") },
        ]}
      />
    </View>
  );
}

function ConversationRow({ conversation, viewerId }: { conversation: Conversation; viewerId: string }) {
  const palette = usePalette();
  const now = useNow();
  const unread = conversation.unread > 0 && !conversation.muted;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${conversation.name}${unread ? `, ${conversation.unread} unread` : ""}. ${preview(conversation, viewerId)}`}
      onPress={() => router.push(`/conversation/${conversation.id}`)}
      style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: HAIRLINE, borderBottomColor: palette.hairline, backgroundColor: pressed ? palette.wash : "transparent" })}
    >
      <ConversationAvatar conversation={conversation} />
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Text variant="name" numberOfLines={1} style={{ flexShrink: 1, fontFamily: unread ? font.bold : font.semibold }}>
            {conversation.name}
          </Text>
          {conversation.muted ? <BellOff size={14} color={palette.inkMuted} accessibilityLabel="Muted" /> : null}
          <Text variant="caption" tone="muted" style={{ marginLeft: "auto" }}>
            {relativeTime(conversation.activeAt, now, timeZone)}
          </Text>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Text variant="subhead" tone={unread ? "ink" : "muted"} numberOfLines={1} style={{ flex: 1 }}>
            {preview(conversation, viewerId)}
          </Text>
          {unread ? (
            <View style={{ minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 6, backgroundColor: palette.primary, alignItems: "center", justifyContent: "center" }}>
              <Text allowFontScaling={false} style={{ fontFamily: font.monoMedium, fontSize: 11, color: palette.primaryInk }}>
                {conversation.unread > 99 ? "99+" : conversation.unread}
              </Text>
            </View>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}
