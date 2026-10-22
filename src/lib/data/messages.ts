import "server-only";
import { z } from "zod";
import {
  conversationSchema,
  MESSAGE_PAGE,
  MESSAGE_SELECT,
  memberSchema,
  messageRowSchema,
  reactionRowSchema,
  replyQuoteSchema,
  SIGNED_URL_SECONDS,
  toMessages,
  type Conversation,
  type Member,
  type Message,
  type MessagePage,
  type MessageRow,
  type Reaction,
  type ReplyQuote,
} from "@/lib/messages";
import { createClient, type Supabase } from "@/lib/supabase/server";

export * from "@/lib/messages";

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
  return toMessages(rows, urls, quotes);
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
