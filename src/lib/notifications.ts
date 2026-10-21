import { z } from "zod";
import { profileCardSchema } from "@/lib/domain";
import { ruleSchema } from "@/lib/rules";

export const notificationTypeSchema = z.enum(["follow", "like", "reply", "quote", "mention", "event_rsvp", "org_added", "moderation"]);
export type NotificationType = z.infer<typeof notificationTypeSchema>;

export const notificationSchema = z
  .object({
    id: z.number(),
    type: notificationTypeSchema,
    message: z.string().nullable(),
    read_at: z.string().nullable(),
    created_at: z.string(),
    actor: profileCardSchema.nullable(),
    following_actor: z.boolean(),
    post: z.object({ id: z.uuid(), body: z.string(), parent_id: z.uuid().nullable(), root_id: z.uuid().nullable(), quote_id: z.uuid().nullable() }).nullable(),
    event: z.object({ id: z.uuid(), title: z.string(), starts_at: z.string() }).nullable(),
    rule: ruleSchema.nullable(),
    moderation_action_id: z.number().nullable(),
  })
  .transform((n) => ({
    id: n.id,
    type: n.type,
    message: n.message,
    unread: n.read_at === null,
    createdAt: n.created_at,
    actor: n.actor,
    followingActor: n.following_actor,
    post: n.post && { id: n.post.id, body: n.post.body, isReply: n.post.parent_id !== null, threadId: n.post.root_id ?? n.post.id },
    event: n.event && { id: n.event.id, title: n.event.title },
    // A removal, suspension or deactivation: the rule it was under, and the
    // decision an appeal is about. An approval notice carries no rule.
    notice: n.rule && { rule: n.rule, decision: n.moderation_action_id },
  }));

export type Notification = z.infer<typeof notificationSchema>;

// A row of the inbox, grouped by the database: likes by post, follows by the
// reader's day, RSVPs by event and mentions by thread. Replies, quotes and
// notices stand alone because their words are the point.
export const notificationGroupSchema = z
  .object({
    key: z.string(),
    type: notificationTypeSchema,
    latest_at: z.string(),
    count: z.number(),
    unread_count: z.number(),
    actor_count: z.number(),
    actors: z.array(profileCardSchema),
    latest: notificationSchema,
  })
  .transform((g) => ({
    key: g.key,
    type: g.type,
    latestAt: g.latest_at,
    count: g.count,
    unread: g.unread_count > 0,
    actorCount: g.actor_count,
    actors: g.actors,
    latest: g.latest,
  }));

export type NotificationGroup = z.infer<typeof notificationGroupSchema>;

// Where the group's members are listed on request: everyone who followed
// that day, every mention in the thread.
export const isExpandable = (group: NotificationGroup) => (group.type === "follow" ? group.actorCount > 1 : group.type === "mention" && group.count > 1);

export const NOTIFICATION_FILTERS = [
  { key: "all", label: "All", types: null, empty: { title: "Nothing yet", body: "When people follow you, reply, mention you or like your posts, you'll see it here." } },
  { key: "replies", label: "Replies", types: ["reply"], empty: { title: "No replies yet", body: "When someone replies to one of your posts, it shows up here." } },
  { key: "mentions", label: "Mentions", types: ["mention"], empty: { title: "No mentions yet", body: "When someone mentions you in a post, it shows up here." } },
  { key: "quotes", label: "Quotes", types: ["quote"], empty: { title: "No quotes yet", body: "When someone quotes one of your posts, it shows up here." } },
  { key: "likes", label: "Likes", types: ["like"], empty: { title: "No likes yet", body: "When someone likes one of your posts, it shows up here." } },
  { key: "follows", label: "Follows", types: ["follow"], empty: { title: "No new followers yet", body: "When someone follows you, it shows up here." } },
  { key: "events", label: "Events", types: ["event_rsvp"], empty: { title: "No RSVPs yet", body: "When people say they're going to your events, it shows up here." } },
  { key: "moderation", label: "Moderation", types: ["moderation", "org_added"], empty: { title: "No updates", body: "Moderation updates about your posts and teams you're added to show up here." } },
] as const satisfies readonly { key: string; label: string; types: readonly NotificationType[] | null; empty: { title: string; body: string } }[];

export type NotificationFilter = (typeof NOTIFICATION_FILTERS)[number];

export type NotificationFilterKey = NotificationFilter["key"];

export const isFilterKey = (key: unknown): key is NotificationFilterKey => NOTIFICATION_FILTERS.some((filter) => filter.key === key);

export const findFilter = (key: unknown): NotificationFilter => NOTIFICATION_FILTERS.find((filter) => filter.key === key) ?? NOTIFICATION_FILTERS[0];
