"use client";

import { Flag, Reply } from "lucide-react";
import { ImageGrid, LinkCard } from "@/components/post/attachments";
import { RichText } from "@/components/post/rich-text";
import { QuickReactions, ReactionsBar } from "@/components/messages/reactions-bar";
import { Avatar } from "@/components/ui/avatar";
import { useTimeZone } from "@/components/ui/local-time";
import { Menu } from "@/components/ui/menu";
import type { Message, ReplyQuote } from "@/lib/data/messages";
import { cn } from "@/lib/cn";

export type Placement = { first: boolean; last: boolean; avatarColumn: boolean; showSender: boolean; showAvatar: boolean };
export type MessageActions = { onActivate: () => void; onReact: (emoji: string) => void; onReply: () => void; onReport: (() => void) | null };

// In the reader's zone: rendered on the server, the page has no zone of its own.
function MessageTime({ iso }: { iso: string }) {
  const timeZone = useTimeZone();
  return <time dateTime={iso}>{new Date(iso).toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit", timeZone })}</time>;
}

export function snippet(content: ReplyQuote["content"]) {
  switch (content.kind) {
    case "removed":
      return "Message removed by a moderator";
    case "message":
      return content.body || (content.images === 1 ? "Photo" : `${content.images} photos`);
    default: {
      const exhaustive: never = content;
      return exhaustive;
    }
  }
}

export function summary(message: Message): ReplyQuote["content"] {
  return message.content.kind === "removed" ? message.content : { kind: "message", body: message.content.body, images: message.content.images.length };
}

export function MessageItem({
  message,
  mine,
  placement,
  viewerId,
  active,
  highlighted,
  seen,
  replyAuthor,
  actions,
  onJump,
}: {
  message: Message;
  mine: boolean;
  placement: Placement;
  viewerId: string;
  active: boolean;
  // Just jumped to from a quote of it.
  highlighted: boolean;
  seen: string | null;
  replyAuthor: string;
  actions: MessageActions | null;
  onJump: (messageId: string) => void;
}) {
  const { content, sender, replyTo } = message;

  return (
    <div
      id={`message-${message.id}`}
      className={cn("group/message flex scroll-mt-16 gap-2 px-4 py-0.5 transition-colors duration-700 sm:px-6", mine ? "justify-end" : "justify-start", placement.first ? "mt-3" : "mt-0.5", highlighted && "bg-primary-soft duration-150")}
    >
      {placement.avatarColumn && !mine ? (
        <div className="w-7 shrink-0 self-end" aria-hidden>
          {placement.showAvatar && sender ? <Avatar person={sender} size="sm" /> : null}
        </div>
      ) : null}
      <div className={cn("flex max-w-[80%] min-w-0 flex-col gap-1", mine ? "items-end" : "items-start")}>
        {placement.showSender && sender ? <span className="px-3 text-xs font-medium text-ink-muted">{sender.displayName}</span> : null}

        {replyTo ? (
          <button type="button" onClick={() => onJump(replyTo.id)} className="max-w-full rounded-xl border border-hairline px-3 py-1.5 text-left text-[13px] leading-snug text-ink-muted hover:bg-wash">
            <span className="block text-xs font-medium">Replying to {replyAuthor}</span>
            <span dir="auto" className="line-clamp-2 wrap-anywhere">
              {snippet(replyTo.content)}
            </span>
          </button>
        ) : null}

        <div className="relative max-w-full">
          {content.kind === "removed" ? (
            <p className="rounded-2xl border border-dashed border-rail px-3 py-2 text-sm text-ink-muted italic">Message removed by a moderator</p>
          ) : (
            <div onClick={actions?.onActivate} onDoubleClick={() => actions?.onReact("❤️")} className={cn("grid max-w-full gap-1", mine ? "justify-items-end" : "justify-items-start")}>
              {content.images.length > 0 ? (
                <div className="w-64 max-w-full [&>div]:mt-0">
                  <ImageGrid images={content.images.map((image) => ({ id: image.path, url: image.url, width: null, height: null, alt: image.alt }))} />
                </div>
              ) : null}
              {content.body ? <RichText body={content.body} className={cn("max-w-full rounded-2xl px-3 py-2 text-[15px] leading-snug", mine ? "bg-primary-soft" : "bg-wash")} /> : null}
              {content.linkUrl && content.images.length === 0 ? (
                <div className="w-80 max-w-full [&>a]:mt-1 [&>div]:mt-1">
                  <LinkCard url={content.linkUrl} preview={content.linkPreview} />
                </div>
              ) : null}
            </div>
          )}

          {actions && content.kind === "message" ? (
            <div
              className={cn(
                "absolute bottom-full z-10 mb-1 flex items-center rounded-full border border-hairline bg-popover p-0.5 shadow-md transition-opacity",
                mine ? "right-0" : "left-0",
                active
                  ? "opacity-100"
                  : "pointer-events-none opacity-0 group-focus-within/message:pointer-events-auto group-focus-within/message:opacity-100 group-hover/message:pointer-events-auto group-hover/message:opacity-100",
              )}
            >
              <QuickReactions reactions={message.reactions} viewerId={viewerId} onToggle={actions.onReact} />
              <button type="button" aria-label="Reply" onClick={actions.onReply} className="rounded-full p-1.5 text-ink-muted hover:bg-wash hover:text-ink">
                <Reply className="size-4" />
              </button>
              {actions.onReport ? <Menu label="More" items={[{ kind: "action", label: "Report message", icon: <Flag />, onSelect: actions.onReport, danger: true }]} /> : null}
            </div>
          ) : null}
        </div>

        <ReactionsBar reactions={message.reactions} viewerId={viewerId} onToggle={actions?.onReact} />

        {placement.last || seen ? (
          <p className="px-1 font-mono text-[11px] text-ink-muted">
            <MessageTime iso={message.createdAt} />
            {seen ? ` · ${seen}` : null}
          </p>
        ) : null}
      </div>
    </div>
  );
}
