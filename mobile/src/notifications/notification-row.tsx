import { router } from "expo-router";
import { AtSign, CalendarCheck, Heart, MessageCircle, PartyPopper, Repeat2, ShieldAlert, ShieldCheck, UserPlus, Users, type LucideIcon } from "lucide-react-native";
import { useState } from "react";
import { Alert, Pressable, View } from "react-native";
import { calendarDate, relativeTime } from "@/lib/format";
import { isExpandable, type Notification, type NotificationGroup, type NotificationType } from "@/lib/notifications";
import { appealDeadline, appealIsOpen, ruleOf } from "@/lib/rules";
import { siteLink } from "@/data/env";
import { startConversation } from "@/data/messages";
import { loadNotificationGroup } from "@/data/notifications";
import { useProfileShadow } from "@/data/shadow";
import { FollowButton } from "@/people/follow-button";
import { Avatar } from "@/ui/avatar";
import { Button } from "@/ui/controls";
import { font, Text } from "@/ui/text";
import { usePalette } from "@/ui/theme";
import { openLink } from "@/util/links";
import { timeZone, useNow } from "@/util/time";

// The website's notification rows (src/app/(app)/notifications/notification-row.tsx).
const ICONS: Record<NotificationType, LucideIcon> = {
  follow: UserPlus,
  like: Heart,
  reply: MessageCircle,
  quote: Repeat2,
  mention: AtSign,
  event_rsvp: CalendarCheck,
  org_added: Users,
  moderation: ShieldAlert,
  joined: PartyPopper,
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

// Where a notification goes: an RSVP to its event, their words to their
// post, a like to your post, a follow to who followed, a team invitation to
// Organisations in Settings.
function open(notification: Notification) {
  if (notification.type === "org_added") return router.push("/settings/organisations");
  if (notification.type === "event_rsvp" && notification.event) return router.push(`/event/${notification.event.id}`);
  if (notification.post) return router.push(`/post/${notification.post.id}`);
  if (notification.actor) return router.push(`/profile/${notification.actor.username}`);
}

// A friend who joined from the reader's invite: a message is the warmest welcome.
function SayWelcome({ profileId }: { profileId: string }) {
  const palette = usePalette();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      label="Say welcome"
      variant="outline"
      size="medium"
      busy={busy}
      icon={<MessageCircle size={16} color={palette.ink} />}
      onPress={() => {
        setBusy(true);
        void startConversation(profileId).then((result) => {
          setBusy(false);
          if (!result.ok) return Alert.alert("Couldn't start a conversation", result.error);
          router.push(`/conversation/${result.data.id}`);
        });
      }}
      style={{ alignSelf: "flex-start" }}
    />
  );
}

function FollowBack({ notification, profileId }: { notification: Notification; profileId: string }) {
  const { following } = useProfileShadow(profileId, { following: notification.followingActor, followers: 0 });
  return <FollowButton profileId={profileId} following={following} followsYou />;
}

// Removals and suspensions name the rule and how to appeal. A notice without
// a rule is good news: a held post went up, an account is back.
function ModerationNotice({ notification }: { notification: Notification }) {
  const now = useNow();
  const { notice } = notification;
  const deadline = appealDeadline(notification.createdAt);
  return (
    <View style={{ gap: 6 }}>
      <Text variant="callout">
        <Text variant="caption" tone={notice ? "destructive" : "primary"}>
          {notice ? "moderation " : "update "}
        </Text>
        {notification.message}
      </Text>
      {notice && notice.rule !== "age" ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", columnGap: 16, rowGap: 4 }}>
          <Text variant="subhead" tone="primary" accessibilityRole="link" onPress={() => openLink(siteLink(ruleOf(notice.rule).href))}>
            Read {ruleOf(notice.rule).short}
          </Text>
          <Text variant="subhead" tone={appealIsOpen(notification.createdAt, now) ? "primary" : "muted"} accessibilityRole="link" onPress={() => router.push(`/appeal/${notification.id}`)}>
            {appealIsOpen(notification.createdAt, now) ? `Think we got it wrong? Appeal by ${calendarDate(deadline, timeZone)}` : `The time to appeal ended on ${calendarDate(deadline, timeZone)}`}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

// Follow buttons only show in the viewer's own inbox: an organisation's
// notifications are about whether the organisation follows back.
export function NotificationRow({ group, recipientId, followable, seenUnread }: { group: NotificationGroup; recipientId: string; followable: boolean; seenUnread: boolean }) {
  const palette = usePalette();
  const now = useNow();
  const [items, setItems] = useState<Notification[] | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const { latest, actors, actorCount, count } = group;
  const [first] = actors;
  const others = actorCount - 1;
  const good = latest.type === "moderation" && !latest.notice;
  const Icon = good ? ShieldCheck : ICONS[latest.type];
  // Unread styling stays for this visit, though the database already has them read.
  const unread = group.unread || seenUnread;

  async function toggle() {
    if (expanded) return setExpanded(false);
    if (items) return setExpanded(true);
    setLoading(true);
    try {
      setItems(await loadNotificationGroup(recipientId, group.key));
      setExpanded(true);
    } catch {
      Alert.alert("Couldn't load these", "Check your connection, then try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Pressable
      accessible={false}
      onPress={() => open(latest)}
      style={({ pressed }) => ({ flexDirection: "row", gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: palette.hairline, backgroundColor: pressed ? palette.wash : unread ? palette.primarySoft : "transparent" })}
    >
      <View style={{ width: 36, height: 36, borderRadius: 18, borderWidth: 2, borderColor: unread ? palette.primary : palette.rail, alignItems: "center", justifyContent: "center", marginTop: 2 }}>
        <Icon size={16} color={unread ? palette.primary : palette.inkMuted} />
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 6 }}>
        {latest.type === "moderation" ? (
          <ModerationNotice notification={latest} />
        ) : (
          <>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
              {actors.map((actor) => (
                <Pressable key={actor.id} accessibilityRole="link" accessibilityLabel={actor.displayName} onPress={() => router.push(`/profile/${actor.username}`)} hitSlop={4}>
                  <Avatar person={actor} size={28} />
                </Pressable>
              ))}
              {actorCount > actors.length ? (
                <View style={{ minWidth: 28, height: 28, borderRadius: 14, paddingHorizontal: 4, backgroundColor: palette.wash, alignItems: "center", justifyContent: "center" }}>
                  <Text variant="caption">+{actorCount - actors.length}</Text>
                </View>
              ) : null}
              <Text variant="caption" tone="muted" style={{ marginLeft: "auto" }}>
                {relativeTime(latest.createdAt, now, timeZone)}
              </Text>
            </View>
            <Text variant="callout">
              {first ? (
                <Text variant="callout" style={{ fontFamily: font.semibold }} accessibilityRole="link" onPress={() => router.push(`/profile/${first.username}`)}>
                  {first.displayName}
                </Text>
              ) : null}
              {others > 0 ? ` and ${others} ${others === 1 ? "other" : "others"}` : ""} {latest.type === "event_rsvp" && others > 0 ? "are going to" : VERBS[latest.type]}
              {latest.type === "event_rsvp" && latest.event ? <Text variant="callout" style={{ fontFamily: font.medium }}>{` ${latest.event.title}`}</Text> : null}
            </Text>
          </>
        )}
        {latest.post?.body ? (
          theirWords(latest.type) ? (
            <Text variant="callout" numberOfLines={6}>
              {latest.post.body}
            </Text>
          ) : (
            <View style={{ borderWidth: 1, borderColor: palette.hairline, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 }}>
              <Text variant="subhead" tone="muted" numberOfLines={3}>
                {latest.post.body}
              </Text>
            </View>
          )
        ) : null}
        {followable && latest.type === "joined" && first ? <SayWelcome profileId={first.id} /> : null}
        {followable && latest.type === "follow" && first && actorCount === 1 ? (
          <View style={{ alignSelf: "flex-start" }}>
            <FollowBack notification={latest} profileId={first.id} />
          </View>
        ) : null}
        {isExpandable(group) ? (
          <View style={{ gap: 8 }}>
            <Pressable accessibilityRole="button" accessibilityState={{ expanded }} disabled={loading} onPress={() => void toggle()} style={{ alignSelf: "flex-start", minHeight: 36, justifyContent: "center" }}>
              <Text variant="subhead" tone="primary" style={{ fontFamily: font.medium }}>
                {expanded ? "Hide" : loading ? "Loading…" : latest.type === "follow" ? `See all ${actorCount}` : `See all ${count}`}
              </Text>
            </Pressable>
            {expanded && items ? (
              <View style={{ gap: 10, borderLeftWidth: 1, borderLeftColor: palette.rail, paddingLeft: 12 }}>
                {items.map((item) =>
                  item.actor ? (
                    <Pressable key={item.id} accessible={false} onPress={() => open(item)} style={{ gap: 2 }}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                        <Avatar person={item.actor} size={24} />
                        <Text variant="subhead" numberOfLines={1} style={{ flex: 1 }}>
                          <Text variant="subhead" style={{ fontFamily: font.medium }}>
                            {item.actor.displayName}
                          </Text>{" "}
                          {latest.type === "follow" ? "" : VERBS[item.type]}
                        </Text>
                        {latest.type === "follow" && followable ? <FollowBack notification={item} profileId={item.actor.id} /> : null}
                      </View>
                      {item.post ? (
                        <Text variant="small" tone="muted" numberOfLines={2}>
                          {item.post.body}
                        </Text>
                      ) : null}
                    </Pressable>
                  ) : null,
                )}
              </View>
            ) : null}
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}
