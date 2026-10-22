import { useLocalSearchParams } from "expo-router";
import { CloudOff, Ellipsis, SearchX } from "lucide-react-native";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, useWindowDimensions, View } from "react-native";
import { z } from "zod";
import type { Post, PostRow as Row, ThreadPlace } from "@/lib/domain";
import { THREAD_MAX_LENGTH } from "@/lib/feeds";
import { PROBLEM, reasonOf, type Reason } from "@/data/errors";
import { loadContinuation, loadPost, loadReplies, loadThread, type Thread } from "@/data/posts";
import { useViewer } from "@/data/session";
import { usePostDeleted } from "@/data/shadow";
import { onPostCreated, onRelationChanged } from "@/util/events";
import { usePostMenu } from "@/post/post-actions";
import { compose, FocusedPost, PostRow } from "@/post/post-row";
import { Avatar } from "@/ui/avatar";
import { Button, EmptyState, EndOfList, FeedSkeleton, IconButton } from "@/ui/controls";
import { ActionSheet } from "@/ui/sheet";
import { BackButton, Header } from "@/ui/header";
import { font, Text } from "@/ui/text";
import { usePalette } from "@/ui/theme";

type Loaded = Extract<Thread, { kind: "thread" }>;
type More = "idle" | "loading" | "failed";
type State =
  | { kind: "loading" }
  | { kind: "failed"; reason: Reason }
  | { kind: "missing" }
  | { kind: "ready"; thread: Loaded; parts: Row[]; partsMore: More; replies: Row[]; next: string | null; more: More };

type Item =
  | { kind: "ancestor"; row: Row; place?: ThreadPlace }
  | { kind: "focus" }
  | { kind: "part"; row: Row; place: ThreadPlace }
  | { kind: "parts-more" }
  | { kind: "replies-heading" }
  | { kind: "reply"; row: Row };

// How often an open post checks it is still there, as the website's gone-cover.tsx does.
const PRESENCE_EVERY = 30_000;

const keyOf = (item: Item) => (item.kind === "ancestor" || item.kind === "part" || item.kind === "reply" ? `${item.kind}-${item.row.id}` : item.kind);

export default function PostScreen() {
  const palette = usePalette();
  const { height } = useWindowDimensions();
  const { id } = useLocalSearchParams<{ id: string }>();
  const postId = z.uuid().safeParse(id).data;
  // What was loaded is kept with the post it belongs to, so another post's
  // thread never shows while this one loads.
  const [stored, setStored] = useState<{ id: string; state: State }>({ id: "", state: { kind: "loading" } });
  const state: State = !postId ? { kind: "missing" } : stored.id === postId ? stored.state : { kind: "loading" };
  // Ancestors join the list once the focused post is laid out, so the list
  // opens on the post itself and they appear above it, a scroll up away.
  const [ancestorsFor, setAncestorsFor] = useState<string | null>(null);
  const ancestorsShown = ancestorsFor === postId;
  const loadingMore = useRef(false);

  const update = useCallback((forId: string, change: (state: State) => State) => {
    setStored((previous) => (previous.id === forId ? { id: forId, state: change(previous.state) } : previous));
  }, []);

  const fetchThread = useCallback((forId: string) => {
    loadThread(forId).then(
      (thread) =>
        setStored({
          id: forId,
          state:
            thread.kind === "missing"
              ? { kind: "missing" }
              : { kind: "ready", thread, parts: thread.continuation.kind === "thread" ? thread.continuation.parts : [], partsMore: "idle", replies: thread.replies, next: thread.next, more: "idle" },
        }),
      (error: unknown) => setStored({ id: forId, state: { kind: "failed", reason: reasonOf(error) } }),
    );
  }, []);

  useEffect(() => {
    if (postId) fetchThread(postId);
  }, [postId, fetchThread]);

  // After a mute or block the conversation is reread; a blocked author's post is then missing.
  useEffect(() => {
    if (!postId) return;
    return onRelationChanged(() => fetchThread(postId));
  }, [postId, fetchThread]);

  // A reply the member just wrote here joins the conversation.
  useEffect(() => {
    if (!postId) return;
    return onPostCreated((created) => {
      if (created.parentId === postId) fetchThread(postId);
    });
  }, [postId, fetchThread]);

  // A post deleted or removed by someone else while it's open is covered;
  // one the viewer deleted keeps its Undo placeholder instead.
  const ready = state.kind === "ready";
  const deletedHere = usePostDeleted(postId ?? "");
  useEffect(() => {
    if (!postId || !ready || deletedHere) return;
    const timer = setInterval(() => {
      void loadPost(postId)
        .then((row) => {
          if (row === null || (row.kind === "tombstone" && row.id === postId)) update(postId, (current) => (current.kind === "ready" ? { kind: "missing" } : current));
        })
        .catch(() => undefined);
    }, PRESENCE_EVERY);
    return () => clearInterval(timer);
  }, [postId, ready, deletedHere, update]);

  const [menu, setMenu] = useState(false);

  const retry = () => {
    if (!postId) return;
    setStored({ id: postId, state: { kind: "loading" } });
    fetchThread(postId);
  };

  const moreReplies = () => {
    if (!postId || state.kind !== "ready" || !state.next || loadingMore.current) return;
    loadingMore.current = true;
    update(postId, (current) => (current.kind === "ready" ? { ...current, more: "loading" } : current));
    loadReplies(postId, state.next)
      .then(
        (page) =>
          update(postId, (current) => {
            if (current.kind !== "ready") return current;
            const seen = new Set(current.replies.map((row) => row.id));
            return { ...current, replies: [...current.replies, ...page.replies.filter((row) => !seen.has(row.id))], next: page.next, more: "idle" };
          }),
        () => update(postId, (current) => (current.kind === "ready" ? { ...current, more: "failed" } : current)),
      )
      .finally(() => {
        loadingMore.current = false;
      });
  };

  const moreParts = () => {
    const last = state.kind === "ready" ? state.parts.at(-1) : undefined;
    if (!postId || !last) return;
    update(postId, (current) => (current.kind === "ready" ? { ...current, partsMore: "loading" } : current));
    loadContinuation(last.id).then(
      (rows) =>
        update(postId, (current) => {
          if (current.kind !== "ready") return current;
          const seen = new Set(current.parts.map((row) => row.id));
          return { ...current, parts: [...current.parts, ...rows.filter((row) => !seen.has(row.id))], partsMore: "idle" };
        }),
      () => update(postId, (current) => (current.kind === "ready" ? { ...current, partsMore: "failed" } : current)),
    );
  };

  const title = state.kind === "ready" && state.thread.post.parentId ? "Reply" : "Post";
  const header = (
    <Header
      title={title}
      left={<BackButton />}
      right={
        state.kind === "ready" ? (
          <IconButton label="Post options" onPress={() => setMenu(true)}>
            <Ellipsis size={19} color={palette.ink} />
          </IconButton>
        ) : undefined
      }
    />
  );

  if (state.kind !== "ready") {
    return (
      <View style={{ flex: 1, backgroundColor: palette.surface }}>
        {header}
        {state.kind === "loading" ? <FeedSkeleton rows={3} /> : null}
        {state.kind === "failed" ? (
          <EmptyState icon={<CloudOff size={26} color={palette.inkMuted} />} title="This post didn't load" action={<Button label="Try again" size="medium" onPress={retry} />}>
            {PROBLEM[state.reason]}
          </EmptyState>
        ) : null}
        {state.kind === "missing" ? (
          <EmptyState icon={<SearchX size={26} color={palette.inkMuted} />} title="We couldn't find that">
            The post may have been deleted, or it isn't available to you.
          </EmptyState>
        ) : null}
      </View>
    );
  }

  const { thread, parts, replies } = state;
  const place = thread.continuation.kind === "thread" ? thread.continuation.place : undefined;
  const placeAbove = (steps: number) => (place && place.position > steps ? { ...place, position: place.position - steps } : undefined);
  const lastPart = parts.at(-1);
  const partsContinue = lastPart?.kind === "post" && lastPart.continuation > 0 && parts.length < THREAD_MAX_LENGTH;

  const items: Item[] = [
    ...(ancestorsShown ? thread.ancestors.map((row, index): Item => ({ kind: "ancestor", row, place: placeAbove(thread.ancestors.length - index) })) : []),
    { kind: "focus" },
    ...(place ? parts.map((row, index): Item => ({ kind: "part", row, place: { ...place, position: place.position + index + 1 } })) : []),
    ...(partsContinue ? [{ kind: "parts-more" } as const] : []),
    { kind: "replies-heading" },
    ...replies.map((row): Item => ({ kind: "reply", row })),
  ];

  const render = ({ item }: { item: Item }) => {
    switch (item.kind) {
      case "ancestor":
        return <PostRow row={item.row} variant="ancestor" place={item.place} />;
      case "focus":
        return <FocusedPost post={thread.post} place={place} onLayout={() => setAncestorsFor(postId ?? null)} onMore={() => setMenu(true)} />;
      case "part":
        return <PostRow row={item.row} variant="reply" place={item.place} />;
      case "parts-more":
        return (
          <Pressable
            accessibilityRole="button"
            disabled={state.partsMore === "loading"}
            onPress={moreParts}
            style={({ pressed }) => ({ minHeight: 48, alignItems: "center", justifyContent: "center", borderBottomWidth: 1, borderBottomColor: palette.hairline, backgroundColor: pressed ? palette.wash : "transparent" })}
          >
            <Text variant="subhead" tone="primary" style={{ fontFamily: font.medium }}>
              {state.partsMore === "loading" ? "Loading…" : state.partsMore === "failed" ? "Couldn't load more of this thread. Try again." : "Show more of this thread"}
            </Text>
          </Pressable>
        );
      case "replies-heading":
        return replies.length > 0 ? (
          <Text variant="small" tone="muted" accessibilityRole="header" style={{ fontFamily: font.semibold, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 2 }}>
            Replies
          </Text>
        ) : null;
      case "reply":
        return <PostRow row={item.row} variant="reply" />;
      default: {
        const exhaustive: never = item;
        return exhaustive;
      }
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: palette.surface }}>
      {header}
      <FlatList
        data={items}
        keyExtractor={keyOf}
        renderItem={render}
        maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
        onEndReached={moreReplies}
        onEndReachedThreshold={2}
        ListFooterComponent={
          <View style={{ minHeight: thread.ancestors.length > 0 ? Math.max(height - 360, 0) : 0 }}>
            {state.more === "loading" ? <ActivityIndicator style={{ paddingVertical: 24 }} color={palette.inkMuted} accessibilityLabel="Loading more replies" /> : null}
            {state.more === "failed" ? (
              <Pressable accessibilityRole="button" onPress={moreReplies} style={{ minHeight: 48, alignItems: "center", justifyContent: "center" }}>
                <Text variant="subhead" tone="primary" style={{ fontFamily: font.medium }}>
                  Couldn't load more replies. Try again.
                </Text>
              </Pressable>
            ) : null}
            {!state.next ? <EndOfList>{replies.length === 0 ? "No replies yet." : "That's the whole conversation."}</EndOfList> : null}
          </View>
        }
        style={{ backgroundColor: palette.surface }}
      />
      <ReplyBar post={thread.post} />
      <PostOptions post={thread.post} open={menu} onClose={() => setMenu(false)} />
    </View>
  );
}

function PostOptions({ post, open, onClose }: { post: Post; open: boolean; onClose: () => void }) {
  const actions = usePostMenu(post);
  return <ActionSheet title={`Post by @${post.author.username}`} actions={actions} open={open} onClose={onClose} />;
}

// The reply field sits above the tab bar, so replying never means leaving the post.
function ReplyBar({ post }: { post: Post }) {
  const palette = usePalette();
  const viewer = useViewer();
  const first = post.author.displayName.split(/\s+/)[0] ?? post.author.displayName;
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 16, paddingVertical: 8, borderTopWidth: 1, borderTopColor: palette.hairline, backgroundColor: palette.surface }}>
      {viewer ? <Avatar person={viewer} size={32} /> : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Reply to ${first}`}
        onPress={() => compose({ reply: post.id })}
        style={({ pressed }) => ({ flex: 1, minHeight: 44, justifyContent: "center", paddingHorizontal: 16, borderRadius: 22, borderWidth: 1, borderColor: palette.rail, backgroundColor: pressed ? palette.wash : palette.surface })}
      >
        <Text variant="callout" tone="muted">
          Write your reply
        </Text>
      </Pressable>
    </View>
  );
}
