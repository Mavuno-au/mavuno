import { z } from "zod";
import { LIMITS } from "@/lib/catalogue";
import { colourSchema, linkPreviewSchema, profileCardSchema, type LinkPreview } from "@/lib/domain";

// Conversations and messages: their rows, how a row becomes a message, and the
// forms. Shared by the website's loaders (src/lib/data/messages.ts) and the app.

const id = z.uuid();
const timestamp = z.string();

export const MESSAGE_PAGE = 30;
export const SIGNED_URL_SECONDS = 60 * 60;

export const roleSchema = z.enum(["owner", "admin", "member"]);
export type GroupRole = z.infer<typeof roleSchema>;

export const memberSchema = z
  .object({
    id,
    username: z.string(),
    display_name: z.string(),
    avatar_url: z.string().nullable(),
    colour: colourSchema,
    status: z.enum(["accepted", "pending"]),
    role: roleSchema,
    read_at: timestamp.nullable(),
  })
  .transform((m) => ({
    id: m.id,
    username: m.username,
    displayName: m.display_name,
    avatarUrl: m.avatar_url,
    colour: m.colour,
    status: m.status,
    role: m.role,
    readAt: m.read_at,
  }));
export type Member = z.infer<typeof memberSchema>;

export const lastMessageSchema = z
  .object({ body: z.string(), sender_id: id.nullable(), created_at: timestamp, images: z.number(), removed: z.boolean() })
  .transform((m) => ({
    senderId: m.sender_id,
    createdAt: m.created_at,
    content: m.removed ? { kind: "removed" as const } : { kind: "message" as const, body: m.body, images: m.images },
  }));
export type LastMessage = z.infer<typeof lastMessageSchema>;

export function groupName(members: Member[]) {
  const names = members.map((member) => member.displayName.split(/\s+/)[0] ?? member.displayName);
  if (names.length === 0) return "Just you";
  if (names.length <= 3) return names.join(", ").replace(/, ([^,]*)$/, " and $1");
  return `${names.slice(0, 2).join(", ")} and ${names.length - 2} others`;
}

export const conversationSchema = z
  .object({
    id,
    kind: z.enum(["direct", "group"]),
    title: z.string().nullable(),
    created_by: id.nullable(),
    created_at: timestamp,
    last_message_at: timestamp.nullable(),
    my_status: z.enum(["accepted", "pending"]),
    my_role: roleSchema,
    archived_at: timestamp.nullable(),
    muted: z.boolean(),
    unread_count: z.number(),
    last_message: lastMessageSchema.nullable(),
    members: z.array(memberSchema),
    // "-infinity" for anyone who can read everything.
    history_from: timestamp.nullable(),
  })
  .transform((c) => {
    const other = c.kind === "direct" ? (c.members[0] ?? null) : null;
    const inviter = c.kind === "direct" ? other : (c.members.find((member) => member.id === c.created_by) ?? null);
    const access =
      c.my_status === "pending"
        ? { kind: "request" as const, from: inviter }
        : other?.status === "pending"
          ? { kind: "waiting" as const, on: other }
          : { kind: "open" as const };
    return {
      id: c.id,
      kind: c.kind,
      title: c.title,
      name: c.kind === "group" ? (c.title ?? groupName(c.members)) : (other?.displayName ?? "Former member"),
      other,
      createdBy: c.created_by,
      activeAt: c.last_message_at ?? c.created_at,
      myRole: c.my_role,
      archived: c.archived_at !== null,
      muted: c.muted,
      unread: c.unread_count,
      lastMessage: c.last_message,
      members: c.members,
      access,
      // When the viewer joined a group without its history, where their view starts.
      historyFrom: c.history_from === "-infinity" ? null : c.history_from,
    };
  });
export type Conversation = z.infer<typeof conversationSchema>;

const PROFILE = "id, username, display_name, avatar_url, colour:effective_colour, account_type, org_verified";
export const MESSAGE_SELECT = `id, conversation_id, sender_id, body, image_paths, image_alts, link_url, link_preview, reply_to_id, removed_at, created_at, sender:profiles!messages_sender_id_fkey(${PROFILE}), reactions:message_reactions(emoji, user_id)`;

export const replyQuoteSchema = z
  .object({ id, sender_id: id.nullable(), body: z.string(), image_paths: z.array(z.string()), removed_at: timestamp.nullable() })
  .transform((r) => ({
    id: r.id,
    senderId: r.sender_id,
    content: r.removed_at ? { kind: "removed" as const } : { kind: "message" as const, body: r.body, images: r.image_paths.length },
  }));
export type ReplyQuote = z.infer<typeof replyQuoteSchema>;

export const messageRowSchema = z.object({
  id,
  conversation_id: id,
  sender_id: id.nullable(),
  body: z.string(),
  image_paths: z.array(z.string()),
  image_alts: z.array(z.string()),
  link_url: z.string().nullable(),
  link_preview: linkPreviewSchema.nullable().catch(null),
  removed_at: timestamp.nullable(),
  created_at: timestamp,
  reply_to_id: id.nullable(),
  sender: profileCardSchema.nullable(),
  reactions: z.array(z.object({ emoji: z.string(), user_id: id }).transform((r) => ({ emoji: r.emoji, userId: r.user_id }))),
});
export type MessageRow = z.infer<typeof messageRowSchema>;

export type MessageImage = { path: string; url: string; alt: string };
export type Reaction = MessageRow["reactions"][number];

export type Message = {
  id: string;
  conversationId: string;
  senderId: string | null;
  sender: MessageRow["sender"];
  createdAt: string;
  replyTo: ReplyQuote | null;
  reactions: Reaction[];
  content: { kind: "removed" } | { kind: "message"; body: string; images: MessageImage[]; linkUrl: string | null; linkPreview: LinkPreview | null };
};

export type MessagePage = { messages: Message[]; next: string | null };

// Signed addresses for the photos and the messages replied to are read by the
// caller; this puts each message together from them.
export function toMessages(rows: MessageRow[], urls: Map<string, string>, quotes: Map<string, ReplyQuote>): Message[] {
  return rows.map((row) => ({
    id: row.id,
    conversationId: row.conversation_id,
    senderId: row.sender_id,
    sender: row.sender,
    createdAt: row.created_at,
    replyTo: (row.reply_to_id && quotes.get(row.reply_to_id)) || null,
    reactions: row.reactions,
    content: row.removed_at
      ? { kind: "removed" }
      : {
          kind: "message",
          body: row.body,
          images: row.image_paths.flatMap((path, index) => {
            const url = urls.get(path);
            return url ? [{ path, url, alt: row.image_alts[index] ?? "" }] : [];
          }),
          linkUrl: row.link_url,
          linkPreview: row.link_preview,
        },
  }));
}

export const reactionRowSchema = z.object({ message_id: id, emoji: z.string(), user_id: id });

export const groupTitleSchema = z.string().trim().max(60, "Group names can be up to 60 characters.");
export const memberIdsSchema = z.array(id).min(1).max(99);
export const newGroupSchema = z.object({ title: groupTitleSchema, memberIds: memberIdsSchema });

export const newMessageSchema = z
  .object({
    conversationId: id,
    body: z.string().trim().max(LIMITS.messageBody, `Messages can be up to ${LIMITS.messageBody} characters.`),
    imagePaths: z.array(z.string().max(200)).max(LIMITS.messageImages, `You can send up to ${LIMITS.messageImages} images.`),
    imageAlts: z.array(z.string().trim().max(LIMITS.imageAlt, `Image descriptions can be up to ${LIMITS.imageAlt} characters.`)),
    replyToId: id.nullable(),
  })
  .refine((message) => message.body.length > 0 || message.imagePaths.length > 0, "Write a message or add an image.")
  .refine((message) => message.imageAlts.length === message.imagePaths.length, "Each image needs its own description field.");

export type NewMessage = z.input<typeof newMessageSchema>;

// The inbox's three boxes, as the website's Messages page and the app show them.
export const BOXES = {
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
export const BOX_KEYS = ["inbox", "requests", "archived"] as const satisfies Box[];

export function boxOf(conversation: Conversation): Box {
  if (conversation.access.kind === "request") return "requests";
  return conversation.archived ? "archived" : "inbox";
}

// A direct conversation nobody has written in yet only shows for the person who opened it.
export const isVisible = (conversation: Conversation, viewerId: string) => conversation.lastMessage !== null || conversation.kind === "group" || conversation.createdBy === viewerId;

export function preview(conversation: Conversation, viewerId: string) {
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
