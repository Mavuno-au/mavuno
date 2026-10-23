"use client";

import type { REALTIME_SUBSCRIBE_STATES, RealtimeChannel, RealtimePostgresInsertPayload, RealtimePostgresUpdatePayload } from "@supabase/supabase-js";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Fragment, useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { fetchMembers, fetchMessage, fetchReactions, loadNewerMessages, loadOlderMessages, markRead, setReaction } from "@/app/actions/messages";
import { ConversationMenu } from "@/components/messages/conversation-menu";
import { MessageComposer, type ReplyTarget } from "@/components/messages/message-composer";
import { MessageItem, snippet, summary, type Placement } from "@/components/messages/message-item";
import { RequestBanner } from "@/components/messages/request-banner";
import { useCounts } from "@/components/shell/live-counts";
import { ReportDialog } from "@/components/moderation/report-dialog";
import { Avatar } from "@/components/ui/avatar";
import { useNow, useTimeZone } from "@/components/ui/local-time";
import { PageHeader } from "@/components/ui/page";
import type { Conversation, Member, Message, Reaction } from "@/lib/data/messages";
import { count, dayLabel } from "@/lib/format";
import { getBrowserClient } from "@/lib/supabase/browser";
import { scrollMotion } from "@/lib/motion";

const RUN_GAP_MS = 5 * 60_000;
const TYPING_MS = 4_000;
const TYPING_EVERY_MS = 2_500;
const CATCH_UP_EVERY_MS = 20_000;
// The newest messages on screen whose reactions are re-read on reconnecting or returning to the tab.
const REACTIONS_RECHECKED = 100;

const insertedMessage = z.object({ id: z.uuid(), sender_id: z.uuid().nullable() });
const updatedMessage = z.object({ id: z.uuid(), removed_at: z.string().nullable(), link_preview: z.unknown().nullable().optional() });
const reactionPayload = z.object({ messageId: z.uuid() });
const typingPayload = z.object({ userId: z.uuid() });
type Row = Record<string, unknown>;

function sameRun(a: Message | undefined, b: Message | undefined, day: (iso: string) => string) {
  if (!a || !b) return false;
  return a.senderId === b.senderId && day(a.createdAt) === day(b.createdAt) && Date.parse(b.createdAt) - Date.parse(a.createdAt) < RUN_GAP_MS;
}

const isReaction = (a: Reaction) => (b: Reaction) => a.emoji === b.emoji && a.userId === b.userId;

function withReaction(messages: Message[], messageId: string, reaction: Reaction, on: boolean) {
  return messages.map((message) => {
    if (message.id !== messageId) return message;
    const others = message.reactions.filter((item) => !isReaction(reaction)(item));
    return { ...message, reactions: on ? [...others, reaction] : others };
  });
}

function withReactions(messages: Message[], reactions: Record<string, Reaction[]>) {
  return messages.map((message) => {
    const fresh = reactions[message.id];
    return fresh ? { ...message, reactions: fresh } : message;
  });
}

function liveTyping(typing: Record<string, number>) {
  return Object.fromEntries(Object.entries(typing).filter(([, until]) => until > Date.now()));
}

export function ThreadView({ conversation, viewerId, initial, next: initialNext }: { conversation: Conversation; viewerId: string; initial: Message[]; next: string | null }) {
  const router = useRouter();
  const [messages, setMessages] = useState(initial);
  const [next, setNext] = useState(initialNext);
  const [loadingOlder, startLoading] = useTransition();
  const [replyTo, setReplyTo] = useState<ReplyTarget | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [reporting, setReporting] = useState<string | null>(null);
  const [typing, setTyping] = useState<Record<string, number>>({});
  const [reads, setReads] = useState<Record<string, string>>({});
  const [olderFailed, setOlderFailed] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const top = useRef<HTMLDivElement>(null);
  const channel = useRef<RealtimeChannel | null>(null);
  const known = useRef(new Set(initial.map((message) => message.id)));
  const shown = useRef(messages);
  const justAccepted = useRef(conversation.access.kind === "request");
  const lastTyped = useRef(0);
  const { id, access, members } = conversation;
  const canRead = access.kind !== "request";
  const waitingOn = access.kind === "waiting" ? access.on.id : null;
  const { refresh: refreshCounts } = useCounts();
  // Days in the reader's own zone; the server renders in Sydney's.
  const timeZone = useTimeZone();
  const today = new Date(useNow());
  const day = (iso: string) => dayLabel(iso, today, timeZone);
  // The channel's handlers read these, so accepting a request doesn't make the channel again: one made
  // while the old one is still leaving is that same channel, and it goes when the old one does.
  const gate = useRef({ canRead, waitingOn, router, refreshCounts });
  const resume = useRef<(() => void) | null>(null);
  useEffect(() => {
    const opened = canRead && !gate.current.canRead;
    gate.current = { canRead, waitingOn, router, refreshCounts };
    if (opened) resume.current?.();
  }, [canRead, waitingOn, router, refreshCounts]);

  useEffect(() => {
    shown.current = messages;
  }, [messages]);

  function add(message: Message) {
    known.current.add(message.id);
    setMessages((current) => (current.some((item) => item.id === message.id) ? current : [...current, message].sort((a, b) => a.createdAt.localeCompare(b.createdAt))));
  }

  useEffect(() => {
    const supabase = getBrowserClient();
    const filter = `conversation_id=eq.${id}`;
    // Private: Realtime lets only the conversation's participants join (see the realtime.messages policies).
    const live: RealtimeChannel = supabase.channel(`conversation:${id}`, { config: { private: true, broadcast: { self: false } } });

    // Other people's read positions are private, so a read is announced with
    // a ping and everyone re-reads receipts through shared_read_at.
    const read = async () => {
      if (!gate.current.canRead || document.visibilityState !== "visible") return;
      try {
        const result = await markRead(id);
        // The badge was read before this conversation was marked read.
        if (result.ok) gate.current.refreshCounts();
        if (!result.ok || !(result.data.announce || justAccepted.current) || live.state !== "joined") return;
        justAccepted.current = false;
        void live.send({ type: "broadcast", event: "read", payload: {} });
      } catch {}
    };

    const refreshReactions = async (messageIds: string[]) => {
      if (messageIds.length === 0) return;
      try {
        const reactions = await fetchReactions(id, messageIds);
        setMessages((current) => withReactions(current, reactions));
      } catch {}
    };

    const catchUp = async () => {
      try {
        const fresh = await loadNewerMessages(id, shown.current.at(-1)?.createdAt ?? null);
        for (const message of fresh) add(message);
        if (fresh.some((message) => message.senderId !== viewerId)) void read();
      } catch {}
      void refreshReactions(shown.current.slice(-REACTIONS_RECHECKED).map((message) => message.id));
    };

    live
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter }, async (payload: RealtimePostgresInsertPayload<Row>) => {
        const row = insertedMessage.safeParse(payload.new);
        if (!row.success) return;
        const { id: messageId, sender_id: senderId } = row.data;
        if (senderId) setTyping((current) => Object.fromEntries(Object.entries(current).filter(([userId]) => userId !== senderId)));
        if (known.current.has(messageId)) return;
        try {
          const message = await fetchMessage(id, messageId);
          if (message) add(message);
        } catch {
          void catchUp();
        }
        if (senderId !== viewerId) void read();
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "messages", filter }, async (payload: RealtimePostgresUpdatePayload<Row>) => {
        const row = updatedMessage.safeParse(payload.new);
        if (!row.success) return;
        const updatedId = row.data.id;
        if (row.data.removed_at) {
          setMessages((current) => current.map((message) => (message.id === updatedId ? { ...message, content: { kind: "removed" } } : message)));
          return;
        }
        // The server writes a message's link card a moment after it is sent;
        // re-reading the message shows it without waiting for a reload.
        if (row.data.link_preview != null && known.current.has(updatedId)) {
          try {
            const message = await fetchMessage(id, updatedId);
            if (message) setMessages((current) => current.map((item) => (item.id === updatedId ? { ...message, reactions: item.reactions } : item)));
          } catch {}
        }
      })
      // Reactions aren't streamed from the table: Realtime can't apply row level
      // security to deletions, so they would reach every subscriber. A ping
      // names the message and everyone re-reads its reactions instead.
      .on("broadcast", { event: "reaction" }, ({ payload }: { payload?: unknown }) => {
        const row = reactionPayload.safeParse(payload);
        if (row.success && known.current.has(row.data.messageId)) void refreshReactions([row.data.messageId]);
      })
      .on("broadcast", { event: "read" }, async () => {
        try {
          const fresh = await fetchMembers(id);
          setReads(Object.fromEntries(fresh.flatMap((member) => (member.readAt ? [[member.id, member.readAt]] : []))));
          if (fresh.some((member) => member.id === gate.current.waitingOn && member.status === "accepted")) gate.current.router.refresh();
        } catch {}
      })
      .on("broadcast", { event: "typing" }, ({ payload }: { payload?: unknown }) => {
        const row = typingPayload.safeParse(payload);
        if (!row.success || row.data.userId === viewerId) return;
        setTyping((current) => ({ ...liveTyping(current), [row.data.userId]: Date.now() + TYPING_MS }));
        setTimeout(() => setTyping(liveTyping), TYPING_MS + 100);
      })
      .subscribe((status: `${REALTIME_SUBSCRIBE_STATES}`) => {
        if (status === "CLOSED") return;
        void read();
        void catchUp();
      });
    channel.current = live;
    resume.current = () => {
      void read();
      void catchUp();
    };

    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      void catchUp();
      void read();
    };
    const timer = setInterval(() => {
      if (document.visibilityState === "visible" && live.state !== "joined") void catchUp();
    }, CATCH_UP_EVERY_MS);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      channel.current = null;
      resume.current = null;
      void supabase.removeChannel(live);
    };
  }, [id, viewerId]);

  useEffect(() => {
    const element = top.current;
    const root = scroller.current;
    if (!element || !root || !next || loadingOlder || olderFailed) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        observer.disconnect();
        startLoading(async () => {
          try {
            const page = await loadOlderMessages(id, next);
            for (const message of page.messages) known.current.add(message.id);
            setMessages((current) => [...page.messages.filter((message) => !current.some((item) => item.id === message.id)), ...current]);
            setNext(page.next);
          } catch {
            setOlderFailed(true);
            toast.error("Couldn't load earlier messages. Check your connection and try again.");
          }
        });
      },
      { root, rootMargin: "400px 0px 0px 0px" },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [id, next, loadingOlder, olderFailed]);

  const people = new Map<string, string>(members.map((member) => [member.id, member.displayName]));
  const authorName = (senderId: string | null) =>
    senderId === viewerId ? "you" : ((senderId && people.get(senderId)) ?? messages.find((message) => message.senderId === senderId)?.sender?.displayName ?? "someone");

  function readAt(member: Member) {
    if (!member.readAt) return null;
    const live = reads[member.id];
    return live && Date.parse(live) > Date.parse(member.readAt) ? live : member.readAt;
  }

  const myLast = messages.findLast((message) => message.senderId === viewerId);
  const seenBy = members.filter((member) => {
    const at = readAt(member);
    return myLast !== undefined && at !== null && Date.parse(at) >= Date.parse(myLast.createdAt);
  });
  const seen = seenBy.length === 0 ? null : conversation.kind === "direct" ? "Seen" : seenBy.length === members.length ? "Seen by everyone" : `Seen by ${count(seenBy.length, "person", "people")}`;

  const typists = Object.keys(typing).flatMap((userId) => people.get(userId) ?? []);
  const typingText = typists.length === 0 ? "" : typists.length === 1 ? `${typists[0]} is typing…` : "Several people are typing…";

  function react(message: Message, emoji: string) {
    const reaction = { emoji, userId: viewerId };
    const on = !message.reactions.some(isReaction(reaction));
    setActiveId(null);
    setMessages((current) => withReaction(current, message.id, reaction, on));
    void setReaction(message.id, emoji, on)
      .catch(() => ({ ok: false as const, error: "Couldn't save your reaction. Try again." }))
      .then((result) => {
        if (result.ok) {
          void channel.current?.send({ type: "broadcast", event: "reaction", payload: { messageId: message.id } });
          return;
        }
        setMessages((current) => withReaction(current, message.id, reaction, !on));
        toast.error(result.error);
      });
  }

  function typed() {
    const now = Date.now();
    if (now - lastTyped.current < TYPING_EVERY_MS) return;
    lastTyped.current = now;
    void channel.current?.send({ type: "broadcast", event: "typing", payload: { userId: viewerId } });
  }

  function jump(messageId: string) {
    document.getElementById(`message-${messageId}`)?.scrollIntoView({ behavior: scrollMotion(), block: "center" });
  }

  const composer = (
    <MessageComposer
      viewerId={viewerId}
      conversationId={id}
      replyTo={replyTo}
      onCancelReply={() => setReplyTo(null)}
      onTyping={typed}
      onSent={(message) => {
        add(message);
        requestAnimationFrame(() => scroller.current?.scrollTo({ top: 0, behavior: scrollMotion() }));
      }}
    />
  );

  function footer() {
    switch (access.kind) {
      case "request":
        return <RequestBanner conversation={conversation} from={access.from} />;
      case "waiting": {
        const sent = messages.some((message) => message.senderId === viewerId);
        return (
          <>
            <p className="border-t border-hairline px-4 py-3 text-sm text-ink-muted sm:px-6">
              Waiting for {access.on.displayName} to accept. {sent ? "You can send more once they do." : "You can send one message until they do."}
            </p>
            {sent ? null : composer}
          </>
        );
      }
      case "open":
        return composer;
      default: {
        const exhaustive: never = access;
        return exhaustive;
      }
    }
  }

  const { other } = conversation;

  return (
    <div className="flex flex-col bg-surface max-md:fixed max-md:inset-x-0 max-md:top-14 max-md:bottom-[max(var(--mobile-nav-height),var(--visual-viewport-bottom,0px))] max-md:z-10 max-md:mx-auto max-md:max-w-[620px] md:h-dvh">
      <PageHeader
        back={conversation.archived ? "/messages/archived" : access.kind === "request" ? "/messages/requests" : "/messages"}
        title={other ? <Link href={`/@${other.username}`} className="hover:underline">{conversation.name}</Link> : conversation.name}
        meta={other ? `@${other.username}${conversation.muted ? " · muted" : ""}` : `${count(members.length + 1, "person", "people")}${conversation.muted ? " · muted" : ""}`}
        actions={access.kind === "request" ? null : <ConversationMenu conversation={conversation} viewerId={viewerId} />}
      />

      <div ref={scroller} className="flex min-h-0 flex-1 flex-col-reverse overflow-y-auto overscroll-contain">
        <div className="pt-6 pb-3">
          <div ref={top} />
          {next && olderFailed ? (
            <p className="h-8 text-center font-mono text-xs text-ink-muted">
              <button type="button" onClick={() => setOlderFailed(false)} className="underline hover:text-ink">
                Load earlier messages
              </button>
            </p>
          ) : next ? (
            <p className="h-8 text-center font-mono text-xs text-ink-muted">{loadingOlder ? "Loading earlier messages…" : ""}</p>
          ) : conversation.historyFrom ? (
            <p className="pb-2 text-center font-mono text-xs text-ink-muted">Messages from before you joined aren't shown</p>
          ) : messages.length > 0 ? (
            <p className="pb-2 text-center font-mono text-xs text-ink-muted">Start of the conversation</p>
          ) : (
            <div className="grid justify-items-center gap-2 px-6 py-16 text-center">
              {other ? <Avatar person={other} size="lg" /> : null}
              <p className="font-semibold">{other ? `Say hello to ${other.displayName}` : "No messages yet"}</p>
              <p className="text-sm text-ink-muted">Messages are private to the people in this conversation.</p>
            </div>
          )}

          {messages.map((message, index) => {
            const previous = messages[index - 1];
            const following = messages[index + 1];
            const mine = message.senderId === viewerId;
            const first = !sameRun(previous, message, day);
            const last = !sameRun(message, following, day);
            const group = conversation.kind === "group";
            const placement: Placement = { first, last, avatarColumn: group, showSender: group && first && !mine, showAvatar: group && last && !mine };
            const newDay = !previous || day(previous.createdAt) !== day(message.createdAt);
            return (
              <Fragment key={message.id}>
                {newDay ? (
                  <p role="separator" className="mt-4 text-center font-mono text-xs text-ink-muted">
                    <time dateTime={message.createdAt} suppressHydrationWarning>
                      {day(message.createdAt)}
                    </time>
                  </p>
                ) : null}
                <MessageItem
                  message={message}
                  mine={mine}
                  placement={placement}
                  viewerId={viewerId}
                  active={activeId === message.id}
                  seen={message === myLast ? seen : null}
                  replyAuthor={message.replyTo ? authorName(message.replyTo.senderId) : ""}
                  onJump={jump}
                  actions={
                    canRead
                      ? {
                          onActivate: () => setActiveId((current) => (current === message.id ? null : message.id)),
                          onReact: (emoji) => react(message, emoji),
                          onReply: () => {
                            setActiveId(null);
                            setReplyTo({ id: message.id, author: authorName(message.senderId), preview: snippet(summary(message)) });
                          },
                          onReport: mine ? null : () => setReporting(message.id),
                        }
                      : null
                  }
                />
              </Fragment>
            );
          })}
        </div>
      </div>

      {canRead ? (
        <p aria-live="polite" className="h-5 truncate px-4 text-xs text-ink-muted sm:px-6">
          {typingText}
        </p>
      ) : null}
      {footer()}
      <ReportDialog target={reporting ? { targetType: "message", targetId: reporting } : null} onClose={() => setReporting(null)} what="message" />
    </div>
  );
}
