import { BellOff, PenSquare, Users } from "lucide-react";
import Link from "next/link";
import { LiveInbox } from "@/components/messages/live-inbox";
import { ClearCount } from "@/components/shell/live-counts";
import { Avatar } from "@/components/ui/avatar";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState, PageHeader, Tabs } from "@/components/ui/page";
import { cn } from "@/lib/cn";
import { loadConversations, type Conversation } from "@/lib/data/messages";
import { relativeTime } from "@/lib/format";
import { requireViewer } from "@/lib/viewer";

const BOXES = {
  inbox: {
    label: "Inbox",
    href: "/messages",
    empty: { title: "No conversations yet", body: "Message someone from their profile, or start a new conversation here." },
  },
  requests: {
    label: "Requests",
    href: "/messages/requests",
    empty: { title: "No message requests", body: "When someone you don't follow messages you, it waits here until you accept. They won't know you've seen it." },
  },
  archived: {
    label: "Archived",
    href: "/messages/archived",
    empty: { title: "Nothing archived", body: "Archived conversations come back to your inbox when someone sends a new message." },
  },
} as const;
export type Box = keyof typeof BOXES;
const BOX_KEYS = ["inbox", "requests", "archived"] as const satisfies Box[];

function boxOf(conversation: Conversation): Box {
  if (conversation.access.kind === "request") return "requests";
  return conversation.archived ? "archived" : "inbox";
}

// A direct conversation nobody has written in yet only shows for the person who opened it.
const isVisible = (conversation: Conversation, viewerId: string) => conversation.lastMessage !== null || conversation.kind === "group" || conversation.createdBy === viewerId;

function preview(conversation: Conversation, viewerId: string) {
  const last = conversation.lastMessage;
  if (!last) return "No messages yet";
  const text =
    last.content.kind === "removed"
      ? "Message removed by a moderator"
      : last.content.body.replace(/\s+/g, " ") || (last.content.images === 1 ? "Sent a photo" : `Sent ${last.content.images} photos`);
  if (last.senderId === viewerId) return `You: ${text}`;
  const sender = conversation.kind === "group" ? conversation.members.find((member) => member.id === last.senderId) : undefined;
  return sender ? `${sender.displayName.split(/\s+/)[0]}: ${text}` : text;
}

export async function Mailbox({ box }: { box: Box }) {
  const viewer = await requireViewer(BOXES[box].href);
  const conversations = (await loadConversations()).filter((conversation) => isVisible(conversation, viewer.id));
  const shown = conversations.filter((conversation) => boxOf(conversation) === box);
  const requests = conversations.filter((conversation) => boxOf(conversation) === "requests").length;
  const { empty } = BOXES[box];

  return (
    <>
      <ClearCount kind="messages" />
      <LiveInbox viewerId={viewer.id} />
      <PageHeader
        title="Messages"
        actions={
          <ButtonLink href="/messages/new" size="sm" aria-label="New message">
            <PenSquare />
            <span className="max-sm:hidden">New message</span>
          </ButtonLink>
        }
      >
        <Tabs tabs={BOX_KEYS.map((key) => ({ href: BOXES[key].href, label: BOXES[key].label, active: key === box, badge: key === "requests" ? requests : undefined }))} />
      </PageHeader>

      {box === "requests" && shown.length > 0 ? (
        <p className="border-b border-hairline bg-wash px-4 py-2.5 text-sm text-ink-muted sm:px-6">From people you don't follow. They won't know you've seen a request until you accept it.</p>
      ) : null}

      {shown.length === 0 ? (
        <EmptyState title={empty.title} action={box === "inbox" ? <ButtonLink href="/messages/new">New message</ButtonLink> : undefined}>
          {empty.body}
        </EmptyState>
      ) : (
        <ul>
          {shown.map((conversation) => (
            <li key={conversation.id}>
              <ConversationRow conversation={conversation} viewerId={viewer.id} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function ConversationRow({ conversation, viewerId }: { conversation: Conversation; viewerId: string }) {
  const unread = conversation.unread > 0 && !conversation.muted;
  return (
    <Link href={`/messages/${conversation.id}`} className="flex items-center gap-3 border-b border-hairline px-4 py-3 transition-colors hover:bg-wash sm:px-6">
      <ConversationAvatar conversation={conversation} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className={cn("truncate text-[15px]", unread ? "font-semibold" : "font-medium")}>{conversation.name}</span>
          {conversation.muted ? <BellOff aria-label="Muted" className="size-3.5 shrink-0 self-center text-ink-muted" /> : null}
          <time dateTime={conversation.activeAt} className="ml-auto shrink-0 font-mono text-xs text-ink-muted">
            {relativeTime(conversation.activeAt)}
          </time>
        </div>
        <div className="flex items-center gap-2">
          <p className={cn("min-w-0 flex-1 truncate text-sm", unread ? "text-ink" : "text-ink-muted")}>{preview(conversation, viewerId)}</p>
          {unread ? (
            <span aria-label={`${conversation.unread} unread`} className="min-w-5 rounded-full bg-primary px-1.5 text-center font-mono text-[11px] leading-5 text-primary-ink tabular">
              {conversation.unread > 99 ? "99+" : conversation.unread}
            </span>
          ) : null}
        </div>
      </div>
    </Link>
  );
}

function ConversationAvatar({ conversation }: { conversation: Conversation }) {
  const [first, second] = conversation.members;
  if (conversation.other) return <Avatar person={conversation.other} />;
  if (first && second) {
    return (
      <span className="relative size-10 shrink-0" aria-hidden>
        <Avatar person={first} size="sm" className="absolute top-0 left-0" />
        <Avatar person={second} size="sm" className="absolute right-0 bottom-0 ring-2 ring-surface" />
      </span>
    );
  }
  if (first) return <Avatar person={first} />;
  return (
    <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-wash text-ink-muted" aria-hidden>
      <Users className="size-5" />
    </span>
  );
}
