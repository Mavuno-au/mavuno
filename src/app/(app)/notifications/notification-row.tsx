"use client";

import { AtSign, CalendarCheck, Heart, MessageCircle, PartyPopper, Repeat2, ShieldAlert, ShieldCheck, UserPlus, Users } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";
import { toast } from "sonner";
import { startConversation } from "@/app/actions/messages";
import { loadNotificationGroup } from "@/app/actions/notifications";
import { FollowButton } from "@/components/people/follow-button";
import { ProfileHoverCard } from "@/components/people/profile-card";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { LocalTime, useNow } from "@/components/ui/local-time";
import { cn } from "@/lib/cn";
import { calendarDate } from "@/lib/format";
import { isExpandable, type Notification, type NotificationGroup, type NotificationType } from "@/lib/notifications";
import { appealDeadline, appealIsOpen, ruleOf } from "@/lib/rules";

const ICONS: Record<NotificationType, ReactNode> = {
  follow: <UserPlus />,
  like: <Heart />,
  reply: <MessageCircle />,
  quote: <Repeat2 />,
  mention: <AtSign />,
  event_rsvp: <CalendarCheck />,
  org_added: <Users />,
  moderation: <ShieldAlert />,
  joined: <PartyPopper />,
};

const VERBS: Record<NotificationType, string> = {
  follow: "followed you",
  like: "liked your post",
  reply: "replied",
  quote: "quoted your post",
  mention: "mentioned you",
  event_rsvp: "is going to",
  org_added: "invited you to its team",
  moderation: "",
  joined: "joined Mavuno from your invite. You follow each other now.",
};

const theirWords = (type: NotificationType) => type === "reply" || type === "mention" || type === "quote";

function href(latest: Notification, owner: string) {
  if (latest.type === "event_rsvp" && latest.event) return `/events/${latest.event.id}`;
  if (latest.post && latest.actor && theirWords(latest.type)) return `/@${latest.actor.username}/posts/${latest.post.id}`;
  if (latest.post) return `/@${owner}/posts/${latest.post.id}`;
  if (latest.actor) return `/@${latest.actor.username}`;
  return null;
}

// Removals and suspensions link to the rule and to how to appeal (terms,
// section 6). Deactivated accounts have their own page for a review. A notice
// without a rule is good news: a held post went up, an account is back.
function ModerationNotice({ notification }: { notification: Notification }) {
  const { notice } = notification;
  const deadline = appealDeadline(notification.createdAt);
  const now = useNow();
  return (
    <>
      <p className="text-[15px]">
        {notice ? (
          <span className="mr-1.5 rounded bg-destructive-soft px-1.5 py-0.5 font-mono text-xs text-destructive">moderation</span>
        ) : (
          <span className="mr-1.5 rounded bg-primary-soft px-1.5 py-0.5 font-mono text-xs text-primary">update</span>
        )}
        {notification.message}
      </p>
      {notice && notice.rule !== "age" ? (
        <p className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-sm">
          <Link href={ruleOf(notice.rule).href} className="text-primary hover:underline">
            Read {ruleOf(notice.rule).short}
          </Link>
          {appealIsOpen(notification.createdAt, now) ? (
            <Link href={`/appeals/${notification.id}`} className="text-primary hover:underline">
              Think we got it wrong? Appeal by {calendarDate(deadline)}
            </Link>
          ) : (
            <Link href={`/appeals/${notification.id}`} className="text-ink-muted hover:underline">
              The time to appeal ended on {calendarDate(deadline)}
            </Link>
          )}
        </p>
      ) : null}
    </>
  );
}

// A friend who joined from the reader's invite: a message is the warmest welcome.
function SayWelcome({ profileId }: { profileId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          try {
            const result = await startConversation(profileId);
            if (!result.ok) {
              toast.error(result.error);
              return;
            }
            router.push(`/messages/${result.data.id}`);
          } catch {
            toast.error("Couldn't reach Mavuno. Check your connection and try again.");
          }
        })
      }
    >
      <MessageCircle />
      Say welcome
    </Button>
  );
}

// Follow buttons only show on the viewer's own inbox: an organisation's
// notifications say whether the organisation follows back, not the viewer.
export function NotificationRow({ group, recipientId, owner, followable, timeZone }: { group: NotificationGroup; recipientId: string; owner: string; followable: boolean; timeZone: string }) {
  const [items, setItems] = useState<Notification[] | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [loading, startLoading] = useTransition();
  const { latest, actors, actorCount, count } = group;
  const [first] = actors;
  const others = actorCount - 1;
  const target = href(latest, owner);
  const expandable = isExpandable(group);
  const good = latest.type === "moderation" && !latest.notice;

  function toggle() {
    if (expanded) {
      setExpanded(false);
      return;
    }
    if (items) {
      setExpanded(true);
      return;
    }
    startLoading(async () => {
      try {
        const result = await loadNotificationGroup({ recipientId, key: group.key, timeZone });
        if (!result.ok) {
          toast.error(result.error);
          return;
        }
        setItems(result.data);
        setExpanded(true);
      } catch {
        toast.error("Couldn't reach Mavuno. Check your connection and try again.");
      }
    });
  }

  return (
    <article className={cn("flex gap-3 border-b border-hairline px-4 py-3 sm:px-6", group.unread && "bg-primary-soft/40")}>
      <span className={cn("mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full border-2 [&>svg]:size-4", group.unread ? "border-primary text-primary" : "border-rail text-ink-muted")}>
        {good ? <ShieldCheck /> : ICONS[latest.type]}
      </span>
      <div className="min-w-0 flex-1">
        {latest.type === "moderation" ? (
          <ModerationNotice notification={latest} />
        ) : (
          <>
            <div className="flex items-center gap-1">
              {actors.map((actor) => (
                <ProfileHoverCard key={actor.id} username={actor.username}>
                  <Link href={`/@${actor.username}`} className="block">
                    <Avatar person={actor} size="sm" />
                  </Link>
                </ProfileHoverCard>
              ))}
              {actorCount > actors.length ? <span className="flex size-7 items-center justify-center rounded-full bg-wash font-mono text-[11px]">+{actorCount - actors.length}</span> : null}
              <span className="ml-auto font-mono text-xs text-ink-muted">
                <LocalTime iso={latest.createdAt} />
              </span>
            </div>
            <p className="mt-1.5 text-[15px]">
              {first ? (
                <ProfileHoverCard username={first.username}>
                  <Link href={`/@${first.username}`} className="font-semibold hover:underline">
                    {first.displayName}
                  </Link>
                </ProfileHoverCard>
              ) : null}
              {others > 0 ? ` and ${others} ${others === 1 ? "other" : "others"}` : ""} {latest.type === "event_rsvp" && others > 0 ? "are going to" : VERBS[latest.type]}
              {latest.type === "event_rsvp" && latest.event ? (
                <>
                  {" "}
                  <Link href={`/events/${latest.event.id}`} className="font-medium hover:underline">{latest.event.title}</Link>
                </>
              ) : null}
            </p>
          </>
        )}

        {latest.post?.body ? (
          target ? (
            <Link href={target} className={cn("mt-1.5 block", theirWords(latest.type) ? "text-[15px]" : "line-clamp-3 rounded-md border border-hairline px-3 py-2 text-sm text-ink-muted")}>
              {latest.post.body}
            </Link>
          ) : null
        ) : null}

        {followable && latest.type === "joined" && first ? (
          <div className="mt-2">
            <SayWelcome profileId={first.id} />
          </div>
        ) : null}

        {followable && latest.type === "follow" && first && actorCount === 1 ? (
          <div className="mt-2">
            <FollowButton profileId={first.id} following={latest.followingActor} followsYou />
          </div>
        ) : null}

        {expandable ? (
          <div className="mt-2">
            <button type="button" aria-expanded={expanded} disabled={loading} className="text-sm font-medium text-primary hover:underline disabled:opacity-60" onClick={toggle}>
              {expanded ? "Hide" : loading ? "Loading…" : latest.type === "follow" ? `See all ${actorCount}` : `See all ${count}`}
            </button>
            {expanded && items && latest.type === "follow" ? (
              <ul className="mt-2 grid gap-2 border-l border-rail pl-3">
                {items.flatMap((item) => (item.actor ? [{ item, actor: item.actor }] : [])).map(({ item, actor }) => (
                  <li key={item.id} className="flex items-center gap-2">
                    <Avatar person={actor} size="sm" />
                    <Link href={`/@${actor.username}`} className="min-w-0 flex-1 truncate text-sm font-medium hover:underline">
                      {actor.displayName}
                    </Link>
                    {followable ? <FollowButton profileId={actor.id} following={item.followingActor} followsYou /> : null}
                  </li>
                ))}
              </ul>
            ) : null}
            {expanded && items && latest.type !== "follow" ? (
              <ul className="mt-2 grid gap-3 border-l border-rail pl-3">
                {items.map((item) => {
                  const link = href(item, owner);
                  return (
                    <li key={item.id} className="min-w-0 text-sm">
                      <p className="flex items-center gap-2">
                        {item.actor ? <Avatar person={item.actor} size="xs" /> : null}
                        <span className="min-w-0 flex-1 truncate">
                          <span className="font-medium">{item.actor?.displayName}</span> <span className="text-ink-muted">{VERBS[item.type]}</span>
                        </span>
                        <span className="font-mono text-xs text-ink-muted">
                          <LocalTime iso={item.createdAt} />
                        </span>
                      </p>
                      {item.post && link ? (
                        <Link href={link} className="mt-0.5 line-clamp-2 block text-ink-muted hover:text-ink">
                          {item.post.body}
                        </Link>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </div>
        ) : null}
      </div>
    </article>
  );
}
