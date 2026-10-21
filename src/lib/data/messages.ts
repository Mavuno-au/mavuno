import "server-only";
import { z } from "zod";
import { colourSchema, profileCardSchema } from "@/lib/domain";
import { createClient, type Supabase } from "@/lib/supabase/server";

const id = z.uuid();
const timestamp = z.string();

export const MESSAGE_PAGE = 30;
const SIGNED_URL_SECONDS = 60 * 60;

const roleSchema = z.enum(["owner", "admin", "member"]);
export type GroupRole = z.infer<typeof roleSchema>;

const memberSchema = z
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

const lastMessageSchema = z
  .object({ body: z.string(), sender_id: id.nullable(), created_at: timestamp, images: z.number(), removed: z.boolean() })
  .transform((m) => ({
    senderId: m.sender_id,
    createdAt: m.created_at,
    content: m.removed ? { kind: "removed" as const } : { kind: "message" as const, body: m.body, images: m.images },
  }));
export type LastMessage = z.infer<typeof lastMessageSchema>;

function groupName(members: Member[]) {
  const names = members.map((member) => member.displayName.split(/\s+/)[0] ?? member.displayName);
  if (names.length === 0) return "Just you";
  if (names.length <= 3) return names.join(", ").replace(/, ([^,]*)$/, " and $1");
  return `${names.slice(0, 2).join(", ")} and ${names.length - 2} others`;
}

const conversationSchema = z
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
const MESSAGE_SELECT = `id, conversation_id, sender_id, body, image_paths, image_alts, reply_to_id, removed_at, created_at, sender:profiles!messages_sender_id_fkey(${PROFILE}), reactions:message_reactions(emoji, user_id)`;

const replyQuoteSchema = z
  .object({ id, sender_id: id.nullable(), body: z.string(), image_paths: z.array(z.string()), removed_at: timestamp.nullable() })
  .transform((r) => ({
    id: r.id,
    senderId: r.sender_id,
    content: r.removed_at ? { kind: "removed" as const } : { kind: "message" as const, body: r.body, images: r.image_paths.length },
  }));
export type ReplyQuote = z.infer<typeof replyQuoteSchema>;

const messageRowSchema = z.object({
  id,
  conversation_id: id,
  sender_id: id.nullable(),
  body: z.string(),
  image_paths: z.array(z.string()),
  image_alts: z.array(z.string()),
  removed_at: timestamp.nullable(),
  created_at: timestamp,
  reply_to_id: id.nullable(),
  sender: profileCardSchema.nullable(),
  reactions: z.array(z.object({ emoji: z.string(), user_id: id }).transform((r) => ({ emoji: r.emoji, userId: r.user_id }))),
});
type MessageRow = z.infer<typeof messageRowSchema>;

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
  content: { kind: "removed" } | { kind: "message"; body: string; images: MessageImage[] };
};

export type MessagePage = { messages: Message[]; next: string | null };

async function signedUrls(supabase: Supabase, rows: MessageRow[]) {
  const paths = rows.flatMap((row) => (row.removed_at ? [] : row.image_paths));
  if (paths.length === 0) return new Map<string, string>();
  const { data } = await supabase.storage.from("message-media").createSignedUrls(paths, SIGNED_URL_SECONDS);
  return new Map((data ?? []).flatMap((item) => (item.path && item.signedUrl ? [[item.path, item.signedUrl] as const] : [])));
}

async function replyQuotes(supabase: Supabase, rows: MessageRow[]) {
  const ids = [...new Set(rows.flatMap((row) => (row.reply_to_id ? [row.reply_to_id] : [])))];
  if (ids.length === 0) return new Map<string, ReplyQuote>();
  const { data } = await supabase.from("messages").select("id, sender_id, body, image_paths, removed_at").in("id", ids);
  return new Map(z.array(replyQuoteSchema).parse(data ?? []).map((quote) => [quote.id, quote] as const));
}

async function hydrate(supabase: Supabase, rows: MessageRow[]): Promise<Message[]> {
  const [urls, quotes] = await Promise.all([signedUrls(supabase, rows), replyQuotes(supabase, rows)]);
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
        },
  }));
}

export async function loadConversations(): Promise<Conversation[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("conversation_list")
    .select("*")
    .order("last_message_at", { ascending: false, nullsFirst: true })
    .limit(200);
  if (error) throw new Error(`Conversations failed: ${error.message}`);
  return z
    .array(conversationSchema)
    .parse(data ?? [])
    .sort((a, b) => b.activeAt.localeCompare(a.activeAt));
}

export async function loadConversation(conversationId: string): Promise<Conversation | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("conversation_list").select("*").eq("id", conversationId).maybeSingle();
  return data ? conversationSchema.parse(data) : null;
}

export async function loadMembers(conversationId: string): Promise<Member[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("conversation_list").select("members").eq("id", conversationId).maybeSingle();
  if (error) throw new Error(`Members failed: ${error.message}`);
  return data ? z.object({ members: z.array(memberSchema) }).parse(data).members : [];
}

export async function loadMessages(conversationId: string, before: string | null = null): Promise<MessagePage> {
  const supabase = await createClient();
  let query = supabase.from("messages").select(MESSAGE_SELECT).eq("conversation_id", conversationId).order("created_at", { ascending: false }).limit(MESSAGE_PAGE);
  if (before) query = query.lt("created_at", before);
  const { data, error } = await query;
  if (error) throw new Error(`Messages failed: ${error.message}`);
  const rows = z.array(messageRowSchema).parse(data ?? []);
  const messages = (await hydrate(supabase, rows)).reverse();
  return { messages, next: rows.length === MESSAGE_PAGE ? (messages[0]?.createdAt ?? null) : null };
}

export async function loadMessagesAfter(conversationId: string, after: string | null): Promise<Message[]> {
  const supabase = await createClient();
  let query = supabase.from("messages").select(MESSAGE_SELECT).eq("conversation_id", conversationId).order("created_at", { ascending: true }).limit(MESSAGE_PAGE);
  if (after) query = query.gt("created_at", after);
  const { data, error } = await query;
  if (error) throw new Error(`Messages failed: ${error.message}`);
  return hydrate(supabase, z.array(messageRowSchema).parse(data ?? []));
}

export async function loadMessage(conversationId: string, messageId: string): Promise<Message | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("messages").select(MESSAGE_SELECT).eq("conversation_id", conversationId).eq("id", messageId).maybeSingle();
  if (!data) return null;
  const [message] = await hydrate(supabase, [messageRowSchema.parse(data)]);
  return message ?? null;
}

const reactionRowSchema = z.object({ message_id: id, emoji: z.string(), user_id: id });

// Reactions for messages already on screen, re-read when someone in the
// conversation says theirs changed. Row level security limits it to
// conversations the viewer is in.
export async function loadReactions(conversationId: string, messageIds: string[]): Promise<Record<string, Reaction[]>> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("message_reactions").select("message_id, emoji, user_id, message:messages!inner(conversation_id)").eq("message.conversation_id", conversationId).in("message_id", messageIds);
  if (error) throw new Error(`Reactions failed: ${error.message}`);
  const reactions: Record<string, Reaction[]> = Object.fromEntries(messageIds.map((messageId) => [messageId, []]));
  for (const row of z.array(reactionRowSchema).parse(data ?? [])) reactions[row.message_id]?.push({ emoji: row.emoji, userId: row.user_id });
  return reactions;
}
