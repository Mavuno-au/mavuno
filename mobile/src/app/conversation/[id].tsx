import type { RealtimeChannel } from "@supabase/supabase-js";
import * as Clipboard from "expo-clipboard";
import { router, useLocalSearchParams } from "expo-router";
import { ArrowUp, Ellipsis, ImagePlus, X } from "lucide-react-native";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, AppState, FlatList, KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { z } from "zod";
import { LIMITS } from "@/lib/catalogue";
import { count, dayLabel } from "@/lib/format";
import type { Conversation, Member, Message } from "@/lib/messages";
import { useCounts } from "@/data/counts";
import { clearDraft, keepDraft, readDraft } from "@/data/drafts";
import { reasonOf, type Reason } from "@/data/errors";
import {
  loadConversation,
  loadMembers,
  loadMessage,
  loadMessages,
  loadMessagesAfter,
  loadReactions,
  markRead,
  respondToRequest,
  sendMessage,
  setArchived,
  setMuted,
  setReaction,
  removeMember,
} from "@/data/messages";
import { dismissPushesAbout } from "@/data/push";
import { useViewer } from "@/data/session";
import { supabase } from "@/data/supabase";
import { pickImages, uploadImage, type PickedImage } from "@/data/upload";
import { ConversationAvatar } from "@/messages/conversation-avatar";
import { MessageBubble, type Delivery } from "@/messages/message-bubble";
import { ImageTray } from "@/post/composer/images";
import { Button, EmptyState, IconButton, LoadFailed } from "@/ui/controls";
import { BackButton, Header } from "@/ui/header";
import { ActionSheet, type SheetAction } from "@/ui/sheet";
import { Text, type } from "@/ui/text";
import { HAIRLINE, usePalette } from "@/ui/theme";
import { toast, useToastFloor } from "@/ui/toast";
import { useBlock } from "@/util/safety";
import { timeZone } from "@/util/time";

// The website's thread (src/components/messages/thread-view.tsx), timings included.
const TYPING_MS = 4_000;
const TYPING_EVERY_MS = 2_500;
const CATCH_UP_EVERY_MS = 20_000;
const RUN_GAP_MS = 5 * 60_000;
// After a pause this long a divider says when the conversation picked up again, as Bluesky's does.
const DIVIDER_GAP_MS = 60 * 60_000;
const REACTIONS_RECHECKED = 100;
const QUICK_REACTIONS = ["❤️", "😂", "👍", "🙏", "🔥"] as const;

const insertedRow = z.object({ id: z.uuid(), sender_id: z.uuid().nullable() });
const updatedRow = z.object({ id: z.uuid(), removed_at: z.string().nullable(), link_preview: z.unknown().optional() });
const reactionPayload = z.object({ messageId: z.uuid() });
const typingPayload = z.object({ userId: z.uuid() });

type Pending = { key: string; body: string; images: PickedImage[]; replyTo: Message | null; delivery: Delivery; createdAt: string };
type Item =
  | { kind: "message"; id: string; message: Message; first: boolean; last: boolean; delivery?: Delivery; pending?: Pending }
  | { kind: "divider"; id: string; label: string }
  | { kind: "history"; id: string };

const day = (iso: string) => dayLabel(iso, new Date(), timeZone);
// "Today at 3:42 pm", in the reader's own zone.
const sentAt = (iso: string) => `${day(iso)} at ${new Date(iso).toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit", timeZone })}`;
const sameRun = (a: Message | undefined, b: Message | undefined) =>
  a !== undefined && b !== undefined && a.senderId === b.senderId && day(a.createdAt) === day(b.createdAt) && Date.parse(b.createdAt) - Date.parse(a.createdAt) < RUN_GAP_MS;

function withReactions(messages: Message[], reactions: Record<string, Message["reactions"]>) {
  return messages.map((message) => (reactions[message.id] ? { ...message, reactions: reactions[message.id] ?? [] } : message));
}

type Loaded = { kind: "loading" } | { kind: "failed"; reason: Reason } | { kind: "missing" } | { kind: "ready"; conversation: Conversation };

export default function ConversationScreen() {
  const palette = usePalette();
  const viewer = useViewer();
  const conversationId = z.uuid().safeParse(useLocalSearchParams().id).data ?? null;
  const [loaded, setLoaded] = useState<{ id: string | null; state: Loaded }>({ id: null, state: { kind: "loading" } });

  const read = useCallback(() => {
    if (!conversationId) return;
    loadConversation(conversationId).then(
      (conversation) => setLoaded({ id: conversationId, state: conversation ? { kind: "ready", conversation } : { kind: "missing" } }),
      (error: unknown) => setLoaded({ id: conversationId, state: { kind: "failed", reason: reasonOf(error) } }),
    );
  }, [conversationId]);

  useEffect(read, [read]);

  const state: Loaded = !conversationId ? { kind: "missing" } : loaded.id === conversationId ? loaded.state : { kind: "loading" };
  if (state.kind !== "ready" || !viewer) {
    return (
      <View style={{ flex: 1, backgroundColor: palette.surface }}>
        <Header title="Messages" left={<BackButton fallback="/messages" />} />
        {state.kind === "loading" ? <ActivityIndicator style={{ marginTop: 40 }} color={palette.inkMuted} accessibilityLabel="Loading the conversation" /> : null}
        {state.kind === "failed" ? <LoadFailed title="This conversation didn't load" reason={state.reason} onRetry={read} /> : null}
        {state.kind === "missing" ? <EmptyState title="We couldn't find that conversation">You may have left it, or it was deleted.</EmptyState> : null}
      </View>
    );
  }
  return <Thread key={state.conversation.id} conversation={state.conversation} viewerId={viewer.id} onChanged={read} />;
}

function Thread({ conversation, viewerId, onChanged }: { conversation: Conversation; viewerId: string; onChanged: () => void }) {
  const palette = usePalette();
  const insets = useSafeAreaInsets();
  const { id, access } = conversation;
  const canRead = access.kind !== "request";
  const waitingOn = access.kind === "waiting" ? access.on.id : null;

  const [messages, setMessages] = useState<Message[]>([]);
  // A request nobody has written in yet has nothing to read.
  const empty = access.kind === "request" && conversation.lastMessage === null;
  const [first, setFirst] = useState<{ kind: "loading" } | { kind: "failed"; reason: Reason } | { kind: "ready" }>(empty ? { kind: "ready" } : { kind: "loading" });
  // Try again rereads the first page; the conversation itself already loaded.
  const [attempt, setAttempt] = useState(0);
  const [older, setOlder] = useState<{ next: string | null; loading: boolean; failed: boolean }>({ next: null, loading: false, failed: false });
  const list = useRef<FlatList<Item>>(null);
  // A quoted message to scroll to once its page is in the list.
  const jumpTo = useRef<string | null>(null);
  const [highlighted, setHighlighted] = useState<string | null>(null);
  const [members, setMembers] = useState<Member[]>(conversation.members);
  const [typing, setTyping] = useState<Record<string, number>>({});
  const [pending, setPending] = useState<Pending[]>([]);
  // What was typed and not sent waits here for the next visit, as Bluesky
  // keeps a draft per conversation; it's written once, on leaving.
  const scope = `message:${id}`;
  const [body, setBody] = useState(() => readDraft(viewerId, scope));
  const unsent = useRef(body);
  useEffect(() => () => void keepDraft(viewerId, scope, unsent.current), [viewerId, scope]);
  const [images, setImages] = useState<PickedImage[]>([]);
  const [activeImage, setActiveImage] = useState<string | null>(null);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [holding, setHolding] = useState<Message | null>(null);
  const [menu, setMenu] = useState(false);
  const channel = useRef<RealtimeChannel | null>(null);
  const shown = useRef<Message[]>([]);
  const known = useRef(new Set<string>());
  const lastTyped = useRef(0);
  const composerFloor = useToastFloor(access.kind !== "request");
  // Stable, so it doesn't make the channel again.
  const { refresh: refreshCounts } = useCounts();
  const { confirmBlock } = useBlock();

  useEffect(() => {
    shown.current = messages;
  }, [messages]);

  // The channel's handlers read these, so accepting a request doesn't make the channel again: one made
  // while the old one is still leaving is that same channel, and it goes when the old one does.
  const gate = useRef({ canRead, waitingOn, onChanged });
  const resume = useRef<(() => void) | null>(null);
  useEffect(() => {
    const opened = canRead && !gate.current.canRead;
    gate.current = { canRead, waitingOn, onChanged };
    if (opened) resume.current?.();
  }, [canRead, waitingOn, onChanged]);

  const add = useCallback((message: Message) => {
    known.current.add(message.id);
    setMessages((current) => (current.some((item) => item.id === message.id) ? current : [...current, message].sort((a, b) => a.createdAt.localeCompare(b.createdAt))));
  }, []);

  // The first page, newest last.
  useEffect(() => {
    if (empty) return;
    let current = true;
    loadMessages(id).then(
      (page) => {
        if (!current) return;
        for (const message of page.messages) known.current.add(message.id);
        setMessages(page.messages);
        setOlder({ next: page.next, loading: false, failed: false });
        setFirst({ kind: "ready" });
      },
      (error: unknown) => current && setFirst({ kind: "failed", reason: reasonOf(error) }),
    );
    return () => {
      current = false;
    };
  }, [id, empty, attempt]);

  // Realtime: new and changed messages from the table, and pings for
  // reactions, reads and typing, as the website does.
  useEffect(() => {
    const filter = `conversation_id=eq.${id}`;
    const live = supabase.channel(`conversation:${id}`, { config: { private: true, broadcast: { self: false } } });

    const readNow = async () => {
      if (!gate.current.canRead || AppState.currentState !== "active") return;
      void dismissPushesAbout(`/conversation/${id}`);
      const { moved, announce } = await markRead(viewerId, id).catch(() => ({ moved: false, announce: false }));
      if (moved) refreshCounts();
      if (announce && live.state === "joined") void live.send({ type: "broadcast", event: "read", payload: {} });
    };
    const refreshReactions = async (ids: string[]) => {
      if (ids.length === 0) return;
      const reactions = await loadReactions(id, ids).catch(() => null);
      if (reactions) setMessages((current) => withReactions(current, reactions));
    };
    const catchUp = async () => {
      const fresh = await loadMessagesAfter(id, shown.current.at(-1)?.createdAt ?? null).catch(() => []);
      for (const message of fresh) add(message);
      if (fresh.some((message) => message.senderId !== viewerId)) void readNow();
      void refreshReactions(shown.current.slice(-REACTIONS_RECHECKED).map((message) => message.id));
    };

    live
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter }, (payload: { new: unknown }) => {
        const row = insertedRow.safeParse(payload.new);
        if (!row.success) return;
        const { id: messageId, sender_id: senderId } = row.data;
        if (senderId) setTyping((current) => Object.fromEntries(Object.entries(current).filter(([userId]) => userId !== senderId)));
        if (known.current.has(messageId)) return;
        void loadMessage(id, messageId)
          .then((message) => message && add(message))
          .catch(() => void catchUp());
        if (senderId !== viewerId) void readNow();
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "messages", filter }, (payload: { new: unknown }) => {
        const row = updatedRow.safeParse(payload.new);
        if (!row.success) return;
        const updatedId = row.data.id;
        if (row.data.removed_at) return setMessages((current) => current.map((message) => (message.id === updatedId ? { ...message, content: { kind: "removed" } } : message)));
        // The server writes a message's link card a moment after it is sent.
        if (row.data.link_preview != null && known.current.has(updatedId)) {
          void loadMessage(id, updatedId).then((message) => {
            if (message) setMessages((current) => current.map((item) => (item.id === updatedId ? { ...message, reactions: item.reactions } : item)));
          });
        }
      })
      .on("broadcast", { event: "reaction" }, ({ payload }: { payload?: unknown }) => {
        const row = reactionPayload.safeParse(payload);
        if (row.success && known.current.has(row.data.messageId)) void refreshReactions([row.data.messageId]);
      })
      .on("broadcast", { event: "read" }, () => {
        void loadMembers(id)
          .then((fresh) => {
            setMembers(fresh);
            if (fresh.some((member) => member.id === gate.current.waitingOn && member.status === "accepted")) gate.current.onChanged();
          })
          .catch(() => undefined);
      })
      .on("broadcast", { event: "typing" }, ({ payload }: { payload?: unknown }) => {
        const row = typingPayload.safeParse(payload);
        if (!row.success || row.data.userId === viewerId) return;
        setTyping((current) => ({ ...current, [row.data.userId]: Date.now() + TYPING_MS }));
        setTimeout(() => setTyping((current) => Object.fromEntries(Object.entries(current).filter(([, until]) => until > Date.now()))), TYPING_MS + 100);
      })
      .subscribe((status) => {
        if (status === "CLOSED") return;
        void readNow();
        void catchUp();
      });
    channel.current = live;
    resume.current = () => {
      void readNow();
      void catchUp();
    };

    const subscription = AppState.addEventListener("change", (appState) => {
      if (appState !== "active") return;
      void catchUp();
      void readNow();
    });
    const timer = setInterval(() => {
      if (AppState.currentState === "active" && live.state !== "joined") void catchUp();
    }, CATCH_UP_EVERY_MS);
    return () => {
      clearInterval(timer);
      subscription.remove();
      channel.current = null;
      resume.current = null;
      void supabase.removeChannel(live);
    };
  }, [id, viewerId, add, refreshCounts]);

  const loadOlder = () => {
    if (!older.next || older.loading) return;
    setOlder((current) => ({ ...current, loading: true, failed: false }));
    loadMessages(id, older.next).then(
      (page) => {
        for (const message of page.messages) known.current.add(message.id);
        setMessages((current) => [...page.messages.filter((message) => !current.some((item) => item.id === message.id)), ...current]);
        setOlder({ next: page.next, loading: false, failed: false });
      },
      () => setOlder((current) => ({ ...current, loading: false, failed: true })),
    );
  };

  const people = new Map(members.map((member) => [member.id, member.displayName]));
  const authorName = (senderId: string | null) =>
    senderId === viewerId ? "you" : ((senderId && people.get(senderId)) ?? messages.find((message) => message.senderId === senderId)?.sender?.displayName ?? "someone");

  // Read receipts on the viewer's last message.
  const myLast = [...messages].reverse().find((message) => message.senderId === viewerId);
  const others = members.filter((member) => member.id !== viewerId);
  const seenBy = others.filter((member) => myLast !== undefined && member.readAt !== null && Date.parse(member.readAt) >= Date.parse(myLast.createdAt));
  const seen = seenBy.length === 0 ? null : conversation.kind === "direct" ? "Seen" : seenBy.length === others.length ? "Seen by everyone" : `Seen by ${count(seenBy.length, "person", "people")}`;
  const typists = Object.keys(typing).flatMap((userId) => people.get(userId) ?? []);
  const typingText = typists.length === 0 ? "" : typists.length === 1 ? `${typists[0]} is typing…` : "Several people are typing…";

  // The one message someone you don't know yet can send until they accept.
  const sentWhileWaiting = access.kind === "waiting" && (messages.some((message) => message.senderId === viewerId) || pending.length > 0);
  const canWrite = access.kind === "open" || (access.kind === "waiting" && !sentWhileWaiting);
  const canSend = canWrite && (body.trim().length > 0 || images.length > 0) && body.length <= LIMITS.messageBody;

  function sayTyping(text: string) {
    setBody(text);
    unsent.current = text;
    const now = Date.now();
    if (!text || now - lastTyped.current < TYPING_EVERY_MS || channel.current?.state !== "joined") return;
    lastTyped.current = now;
    void channel.current.send({ type: "broadcast", event: "typing", payload: { userId: viewerId } });
  }

  async function deliver(item: Pending) {
    setPending((current) => current.map((other) => (other.key === item.key ? { ...other, delivery: { kind: "sending" } } : other)));
    const paths: string[] = [];
    for (const image of item.images) {
      const uploaded = await uploadImage(image, { bucket: "message-media", conversationId: id });
      if (!uploaded.ok) {
        if (paths.length > 0) await supabase.storage.from("message-media").remove(paths);
        return setPending((current) => current.map((other) => (other.key === item.key ? { ...other, delivery: { kind: "failed", error: uploaded.error } } : other)));
      }
      paths.push(uploaded.data.path);
    }
    const result = await sendMessage(viewerId, { conversationId: id, body: item.body, imagePaths: paths, imageAlts: item.images.map((image) => image.alt.trim()), replyToId: item.replyTo?.id ?? null });
    if (!result.ok) {
      if (paths.length > 0) await supabase.storage.from("message-media").remove(paths);
      return setPending((current) => current.map((other) => (other.key === item.key ? { ...other, delivery: { kind: "failed", error: result.error } } : other)));
    }
    add(result.data);
    setPending((current) => current.filter((other) => other.key !== item.key));
  }

  function send() {
    if (!canSend) return;
    const item: Pending = { key: `pending-${Date.now()}`, body: body.trim(), images, replyTo, delivery: { kind: "sending" }, createdAt: new Date().toISOString() };
    setPending((current) => [...current, item]);
    setBody("");
    unsent.current = "";
    clearDraft(viewerId, scope);
    setImages([]);
    setActiveImage(null);
    setReplyTo(null);
    void deliver(item);
    // Someone reading history still sees what they sent.
    requestAnimationFrame(() => list.current?.scrollToOffset({ offset: 0, animated: true }));
  }

  // The quoted message may be older than the pages read so far: they are read
  // until it turns up, then it is brought to the middle and lit for a moment.
  async function jump(messageId: string) {
    if (messages.some((message) => message.id === messageId)) return show(messageId);
    let cursor = older.next;
    if (!cursor || older.loading) return;
    setOlder((current) => ({ ...current, loading: true, failed: false }));
    const found: Message[] = [];
    try {
      while (cursor && !found.some((message) => message.id === messageId)) {
        const page = await loadMessages(id, cursor);
        found.unshift(...page.messages);
        cursor = page.next;
      }
    } catch {
      return setOlder((current) => ({ ...current, loading: false, failed: true }));
    }
    for (const message of found) known.current.add(message.id);
    if (!found.some((message) => message.id === messageId)) {
      setOlder({ next: cursor, loading: false, failed: false });
      return toast("That message isn't available any more.");
    }
    // Shown once the list has laid the new pages out (onContentSizeChange).
    jumpTo.current = messageId;
    setMessages((current) => [...found.filter((message) => !current.some((item) => item.id === message.id)), ...current]);
    setOlder({ next: cursor, loading: false, failed: false });
  }

  function show(messageId: string) {
    const index = reversed.findIndex((item) => item.kind === "message" && item.id === messageId);
    if (index < 0) return;
    list.current?.scrollToIndex({ index, viewPosition: 0.5, animated: true });
    setHighlighted(messageId);
    setTimeout(() => setHighlighted((current) => (current === messageId ? null : current)), 1600);
  }

  function react(message: Message, emoji: string, on: boolean) {
    setMessages((current) =>
      current.map((item) =>
        item.id === message.id
          ? { ...item, reactions: on ? [...item.reactions, { emoji, userId: viewerId }] : item.reactions.filter((reaction) => !(reaction.emoji === emoji && reaction.userId === viewerId)) }
          : item,
      ),
    );
    void setReaction(viewerId, message.id, emoji, on).then((result) => {
      if (!result.ok) return toast(`Couldn't react. ${result.error}`, { tone: "error" });
      void channel.current?.send({ type: "broadcast", event: "reaction", payload: { messageId: message.id } });
    });
  }

  // Shown newest first, as a chat reads from the bottom.
  const shownPending: Message[] = pending.map((item) => ({
    id: item.key,
    conversationId: id,
    senderId: viewerId,
    sender: null,
    createdAt: item.createdAt,
    replyTo: item.replyTo ? { id: item.replyTo.id, senderId: item.replyTo.senderId, content: item.replyTo.content.kind === "removed" ? { kind: "removed" } : { kind: "message", body: item.replyTo.content.body, images: item.replyTo.content.images.length } } : null,
    reactions: [],
    content: { kind: "message", body: item.body, images: item.images.map((image) => ({ path: image.key, url: image.uri, alt: image.alt })), linkUrl: null, linkPreview: null },
  }));
  const all = [...messages, ...shownPending];
  const items: Item[] = [];
  if (conversation.historyFrom && !older.next) items.push({ kind: "history", id: "history" });
  all.forEach((message, index) => {
    const previous = all[index - 1];
    const following = all[index + 1];
    const paused = previous !== undefined && Date.parse(message.createdAt) - Date.parse(previous.createdAt) > DIVIDER_GAP_MS;
    if (!previous || paused || day(previous.createdAt) !== day(message.createdAt)) items.push({ kind: "divider", id: `divider-${message.id}`, label: sentAt(message.createdAt) });
    const waiting = pending.find((item) => item.key === message.id);
    items.push({ kind: "message", id: message.id, message, first: !sameRun(previous, message), last: !sameRun(message, following), delivery: waiting?.delivery, pending: waiting });
  });
  const reversed = [...items].reverse();

  const menuActions: SheetAction[] = [
    ...(conversation.other ? [{ label: "View profile", onPress: () => conversation.other && router.push(`/profile/${conversation.other.username}`) }] : []),
    ...(conversation.kind === "group" ? [{ label: "Group settings", onPress: () => router.push(`/group/${id}`) }] : []),
    ...(access.kind === "request"
      ? []
      : [
          { label: conversation.muted ? "Unmute" : "Mute", onPress: () => void setMuted(id, !conversation.muted).then((result) => (result.ok ? onChanged() : Alert.alert("Couldn't change that", result.error))) },
          {
            label: conversation.archived ? "Move to inbox" : "Archive",
            onPress: () =>
              void setArchived(id, !conversation.archived).then((result) => {
                if (!result.ok) return Alert.alert("Couldn't change that", result.error);
                toast(conversation.archived ? "Moved to your inbox" : "Archived. It comes back when someone sends a new message.");
                onChanged();
              }),
          },
        ]),
    ...(conversation.other
      ? [
          { label: `Report @${conversation.other.username}`, destructive: true, onPress: () => conversation.other && router.push({ pathname: "/report", params: { type: "profile", id: conversation.other.id } }) },
          {
            label: `Block @${conversation.other.username}`,
            destructive: true,
            onPress: () => {
              const other = conversation.other;
              if (!other) return;
              confirmBlock(other, () => {
                toast(`Blocked @${other.username}`);
                router.back();
              });
            },
          },
        ]
      : []),
    ...(conversation.kind === "group"
      ? [
          {
            label: "Leave group",
            destructive: true,
            onPress: () =>
              Alert.alert("Leave this group?", "You won't get its messages any more. Someone in it can add you again.", [
                { text: "Cancel", style: "cancel" },
                { text: "Leave", style: "destructive", onPress: () => void removeMember(id, viewerId).then((result) => (result.ok ? router.back() : Alert.alert("Couldn't leave", result.error))) },
              ]),
          },
        ]
      : []),
  ];

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1, backgroundColor: palette.surface }}>
      <Header
        left={<BackButton fallback="/messages" />}
        right={
          <IconButton label="Conversation options" onPress={() => setMenu(true)}>
            <Ellipsis size={19} color={palette.ink} />
          </IconButton>
        }
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={conversation.kind === "group" ? `${conversation.name}. Group settings` : `${conversation.name}. View profile`}
          onPress={() => (conversation.kind === "group" ? router.push(`/group/${id}`) : conversation.other && router.push(`/profile/${conversation.other.username}`))}
          style={{ flexDirection: "row", alignItems: "center", gap: 8, maxWidth: "100%" }}
        >
          <ConversationAvatar conversation={conversation} size={30} />
          <Text variant="headline" numberOfLines={1} style={{ flexShrink: 1 }} maxFontSizeMultiplier={1.6}>
            {conversation.name}
          </Text>
        </Pressable>
      </Header>
      {access.kind === "request" ? <RequestBanner conversation={conversation} onChanged={onChanged} /> : null}
      {first.kind === "failed" ? (
        <LoadFailed
          title="Messages didn't load"
          reason={first.reason}
          onRetry={() => {
            setFirst({ kind: "loading" });
            setAttempt((count) => count + 1);
          }}
        />
      ) : (
        <FlatList
          ref={list}
          inverted
          data={reversed}
          keyExtractor={(item) => item.id}
          // A message arriving while someone reads history leaves what they
          // are reading where it is; at the bottom, the list follows it.
          maintainVisibleContentPosition={{ minIndexForVisible: 0, autoscrollToTopThreshold: 120 }}
          onContentSizeChange={() => {
            const messageId = jumpTo.current;
            if (!messageId || !reversed.some((item) => item.kind === "message" && item.id === messageId)) return;
            jumpTo.current = null;
            show(messageId);
          }}
          // A quoted message far up may not be laid out yet: get near it, then try again.
          onScrollToIndexFailed={({ index, averageItemLength }) => {
            list.current?.scrollToOffset({ offset: index * averageItemLength, animated: false });
            setTimeout(() => list.current?.scrollToIndex({ index, viewPosition: 0.5, animated: true }), 100);
          }}
          // A failed page waits for Try again, or the spinner going away would fire this again at once.
          onEndReached={older.failed ? undefined : loadOlder}
          onEndReachedThreshold={1}
          keyboardDismissMode="interactive"
          keyboardShouldPersistTaps="handled"
          ListHeaderComponent={
            <View style={{ paddingHorizontal: 16, paddingBottom: 6, alignItems: "flex-end", minHeight: 8 }}>
              {seen ? (
                <Text variant="caption" tone="muted">
                  {seen}
                </Text>
              ) : null}
              {typingText ? (
                <Text variant="caption" tone="muted" style={{ alignSelf: "flex-start" }} accessibilityLiveRegion="polite">
                  {typingText}
                </Text>
              ) : null}
            </View>
          }
          ListFooterComponent={
            first.kind === "loading" || older.loading ? (
              <ActivityIndicator style={{ paddingVertical: 16 }} color={palette.inkMuted} accessibilityLabel="Loading messages" />
            ) : older.failed ? (
              <Pressable accessibilityRole="button" onPress={loadOlder} style={{ minHeight: 48, alignItems: "center", justifyContent: "center" }}>
                <Text variant="subhead" tone="primary">
                  Couldn't load earlier messages. Try again.
                </Text>
              </Pressable>
            ) : undefined
          }
          ListEmptyComponent={
            first.kind === "ready" && access.kind !== "request" ? (
              <View style={{ transform: [{ scaleY: -1 }] }}>
                <EmptyState title="Say hello">{conversation.kind === "group" ? "Start the conversation." : `This is the start of your conversation with ${conversation.name}.`}</EmptyState>
              </View>
            ) : undefined
          }
          renderItem={({ item }) => {
            switch (item.kind) {
              case "divider":
                return (
                  <Text variant="caption" tone="muted" style={{ textAlign: "center", paddingVertical: 10 }}>
                    {item.label}
                  </Text>
                );
              case "history":
                return (
                  <Text variant="caption" tone="muted" style={{ textAlign: "center", paddingVertical: 10 }}>
                    Messages from before you joined aren't shown
                  </Text>
                );
              case "message": {
                const waiting = item.pending;
                const message = item.message;
                // VoiceOver reaches what pressing and holding offers as the bubble's actions.
                const actions = waiting ? [] : [...(message.content.kind === "message" ? [{ label: "React", onPress: () => setHolding(message) }] : []), ...messageActions(message, viewerId, () => setReplyTo(message))];
                return (
                  <MessageBubble
                    message={item.message}
                    mine={item.message.senderId === viewerId}
                    group={conversation.kind === "group"}
                    first={item.first}
                    last={item.last}
                    viewerId={viewerId}
                    authorName={authorName}
                    delivery={item.delivery}
                    actions={actions}
                    highlighted={highlighted === item.id}
                    onJump={jump}
                    onLongPress={() => (waiting ? undefined : setHolding(item.message))}
                    onRetry={() => waiting && void deliver(waiting)}
                    onReact={(emoji, on) => react(item.message, emoji, on)}
                  />
                );
              }
              default: {
                const exhaustive: never = item;
                return exhaustive;
              }
            }
          }}
        />
      )}
      {access.kind === "waiting" ? (
        <Text variant="small" tone="muted" style={{ paddingHorizontal: 16, paddingVertical: 8, textAlign: "center", backgroundColor: palette.wash }}>
          Waiting for {access.on.displayName} to accept. {sentWhileWaiting ? "You can send more once they do." : "You can send one message until they do."}
        </Text>
      ) : null}
      {access.kind === "request" ? null : (
        <View {...composerFloor} style={{ borderTopWidth: HAIRLINE, borderTopColor: palette.hairline, paddingHorizontal: 12, paddingTop: 8, paddingBottom: Math.max(insets.bottom, 8), gap: 8, backgroundColor: palette.surface }}>
          {replyTo ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12, backgroundColor: palette.wash }}>
              <Text variant="small" tone="muted" numberOfLines={1} style={{ flex: 1 }}>
                Replying to {authorName(replyTo.senderId)}: {replyTo.content.kind === "message" ? replyTo.content.body || "Photo" : "Message removed"}
              </Text>
              <Pressable accessibilityRole="button" accessibilityLabel="Cancel reply" onPress={() => setReplyTo(null)} hitSlop={14}>
                <X size={16} color={palette.inkMuted} />
              </Pressable>
            </View>
          ) : null}
          <ImageTray
            images={images}
            active={activeImage}
            onSelect={setActiveImage}
            onRemove={(key) => setImages((current) => current.filter((image) => image.key !== key))}
            onDescribe={(key, alt) => setImages((current) => current.map((image) => (image.key === key ? { ...image, alt } : image)))}
          />
          <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 6 }}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Add photos"
              disabled={!canWrite || images.length >= LIMITS.messageImages}
              onPress={() =>
                void pickImages(LIMITS.messageImages - images.length).then((picked) => {
                  if (picked.length === 0) return;
                  setImages((current) => [...current, ...picked].slice(0, LIMITS.messageImages));
                  setActiveImage(picked[0]?.key ?? null);
                })
              }
              style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}
            >
              <ImagePlus size={22} color={!canWrite || images.length >= LIMITS.messageImages ? palette.rail : palette.primary} />
            </Pressable>
            <TextInput
              accessibilityLabel="Message"
              placeholder={canWrite ? "Message" : "You can send more once they accept"}
              placeholderTextColor={palette.inkMuted}
              value={body}
              onChangeText={sayTyping}
              editable={canWrite}
              multiline
              maxLength={LIMITS.messageBody + 100}
              style={[type.body, { flex: 1, minHeight: 44, maxHeight: 140, paddingHorizontal: 14, paddingTop: 11, paddingBottom: 11, borderRadius: 22, borderWidth: 1, borderColor: palette.rail, color: palette.ink, fontSize: 16 }]}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Send"
              accessibilityState={{ disabled: !canSend }}
              disabled={!canSend}
              onPress={send}
              style={{ width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: canSend ? palette.primary : palette.wash }}
            >
              <ArrowUp size={20} color={canSend ? palette.primaryInk : palette.inkMuted} strokeWidth={2.4} />
            </Pressable>
          </View>
          {body.length > LIMITS.messageBody - 200 ? (
            <Text variant="caption" tone={body.length > LIMITS.messageBody ? "destructive" : "muted"} style={{ textAlign: "right" }}>
              {LIMITS.messageBody - body.length}
            </Text>
          ) : null}
        </View>
      )}
      <HoldMenu
        message={holding}
        viewerId={viewerId}
        onClose={() => setHolding(null)}
        onReact={(emoji) => {
          if (!holding) return;
          const mine = holding.reactions.some((reaction) => reaction.emoji === emoji && reaction.userId === viewerId);
          react(holding, emoji, !mine);
        }}
        actions={holding ? messageActions(holding, viewerId, () => setReplyTo(holding)) : []}
      />
      <ActionSheet title={conversation.name} actions={menuActions} open={menu} onClose={() => setMenu(false)} />
    </KeyboardAvoidingView>
  );
}

type MessageAction = { label: string; onPress: () => void; destructive?: boolean };

// What pressing and holding a message offers besides reactions: reply, copy,
// or report someone else's.
function messageActions(message: Message, viewerId: string, onReply: () => void): MessageAction[] {
  const text = message.content.kind === "message" ? message.content.body : "";
  return [
    ...(message.content.kind === "message" ? [{ label: "Reply", onPress: onReply }] : []),
    ...(text ? [{ label: "Copy text", onPress: () => void Clipboard.setStringAsync(text).then(() => toast("Copied")) }] : []),
    ...(message.senderId === viewerId ? [] : [{ label: "Report message", destructive: true, onPress: () => router.push({ pathname: "/report", params: { type: "message", id: message.id } }) }]),
  ];
}

// Press and hold a message: when it was sent, reactions, and its actions.
function HoldMenu({ message, viewerId, actions, onClose, onReact }: { message: Message | null; viewerId: string; actions: MessageAction[]; onClose: () => void; onReact: (emoji: string) => void }) {
  const palette = usePalette();
  const insets = useSafeAreaInsets();
  const open = message !== null;
  const choose = (action: () => void) => {
    onClose();
    action();
  };
  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(0, 0, 0, 0.35)" }]} />
      <View style={{ position: "absolute", left: 16, right: 16, bottom: insets.bottom + 24, gap: 10 }}>
        {message?.content.kind === "message" ? (
          <View accessibilityRole="toolbar" accessibilityLabel="Reactions" style={{ flexDirection: "row", justifyContent: "space-around", padding: 8, borderRadius: 28, backgroundColor: palette.popover }}>
            {QUICK_REACTIONS.map((emoji) => {
              const on = message.reactions.some((reaction) => reaction.emoji === emoji && reaction.userId === viewerId);
              return (
                <Pressable
                  key={emoji}
                  accessibilityRole="button"
                  accessibilityLabel={`${on ? "Remove" : "React with"} ${emoji}`}
                  onPress={() => choose(() => onReact(emoji))}
                  style={{ width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center", backgroundColor: on ? palette.primarySoft : "transparent" }}
                >
                  <Text allowFontScaling={false} style={{ fontSize: 26 }}>
                    {emoji}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        ) : null}
        <View style={{ borderRadius: 16, overflow: "hidden", backgroundColor: palette.popover }}>
          {message ? (
            <Text variant="caption" tone="muted" style={{ paddingHorizontal: 18, paddingTop: 12, paddingBottom: 10 }}>
              {sentAt(message.createdAt)}
            </Text>
          ) : null}
          {actions.map((action) => (
            <Pressable
              key={action.label}
              accessibilityRole="button"
              onPress={() => choose(action.onPress)}
              style={({ pressed }) => ({ minHeight: 52, paddingHorizontal: 18, justifyContent: "center", borderTopWidth: HAIRLINE, borderTopColor: palette.hairline, backgroundColor: pressed ? palette.wash : "transparent" })}
            >
              <Text variant="body" tone={action.destructive ? "destructive" : "ink"}>
                {action.label}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>
    </Modal>
  );
}

// People you don't follow can send one message. Accepting opens the
// conversation; declining is private, and they aren't told.
function RequestBanner({ conversation, onChanged }: { conversation: Conversation; onChanged: () => void }) {
  const palette = usePalette();
  const [busy, setBusy] = useState(false);
  const from = conversation.access.kind === "request" ? conversation.access.from : null;
  const name = from?.displayName ?? "Someone";
  const { block } = useBlock();

  async function respond(choice: "accept" | "decline" | "block") {
    setBusy(true);
    if (choice === "block" && from) {
      const blocked = await block(from.id);
      if (!blocked.ok) {
        setBusy(false);
        return Alert.alert("Couldn't block", blocked.error);
      }
    }
    const result = await respondToRequest(conversation.id, choice === "accept");
    setBusy(false);
    if (!result.ok) return Alert.alert("Couldn't answer the request", result.error);
    if (choice === "accept") return onChanged();
    toast(choice === "block" ? `Blocked ${name}` : "Request declined. They won't be told.");
    router.back();
  }

  return (
    <View style={{ margin: 12, padding: 14, gap: 10, borderRadius: 14, borderWidth: 1, borderColor: palette.hairline, backgroundColor: palette.wash }}>
      <Text variant="headline">{conversation.kind === "group" ? `${name} added you to ${conversation.name}` : `${name} wants to message you`}</Text>
      <Text variant="subhead" tone="muted">
        You don't follow them. They won't know you've read this unless you accept, and declining is private.
      </Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        <Button label="Accept" size="medium" busy={busy} onPress={() => void respond("accept")} />
        <Button label="Decline" size="medium" variant="outline" disabled={busy} onPress={() => void respond("decline")} />
        {from ? <Button label="Block" size="medium" variant="plain" disabled={busy} onPress={() => void respond("block")} /> : null}
        {from ? <Button label="Report" size="medium" variant="plain" disabled={busy} onPress={() => router.push({ pathname: "/report", params: { type: "profile", id: from.id } })} /> : null}
      </View>
    </View>
  );
}
