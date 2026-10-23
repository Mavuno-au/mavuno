import { z } from "zod";
import { parsePeople, type PersonSummary } from "@/lib/domain";
import {
  conversationSchema,
  groupTitleSchema,
  MESSAGE_PAGE,
  MESSAGE_SELECT,
  memberIdsSchema,
  memberSchema,
  messageRowSchema,
  newGroupSchema,
  newMessageSchema,
  reactionRowSchema,
  replyQuoteSchema,
  SIGNED_URL_SECONDS,
  toMessages,
  type Conversation,
  type Member,
  type Message,
  type MessagePage,
  type MessageRow,
  type NewMessage,
  type Reaction,
  type ReplyQuote,
} from "@/lib/messages";
import { done, fail, failFrom, ok, type Result } from "@/lib/result";
import { runTasks } from "@/data/api";
import { requestError } from "@/data/errors";
import { supabase } from "@/data/supabase";

// The website's message loaders and actions (src/lib/data/messages.ts and
// src/app/actions/messages.ts), against the same tables and functions.

export type { Conversation, Member, Message, Reaction } from "@/lib/messages";

const id = z.uuid();

const lenient = <T>(schema: z.ZodType<T>, data: unknown) =>
  z
    .array(z.unknown())
    .parse(data ?? [])
    .flatMap((row) => {
      const parsed = schema.safeParse(row);
      return parsed.success ? [parsed.data] : [];
    });

export async function loadConversations(): Promise<Conversation[]> {
  const { data, error } = await supabase.from("conversation_list").select("*").order("last_message_at", { ascending: false, nullsFirst: true }).limit(200);
  if (error) throw requestError("Conversations", error);
  return lenient(conversationSchema, data).sort((a, b) => b.activeAt.localeCompare(a.activeAt));
}

export async function loadConversation(conversationId: string): Promise<Conversation | null> {
  const { data, error } = await supabase.from("conversation_list").select("*").eq("id", conversationId).maybeSingle();
  if (error) throw requestError("Conversation", error);
  return data ? (conversationSchema.safeParse(data).data ?? null) : null;
}

export async function loadMembers(conversationId: string): Promise<Member[]> {
  const { data, error } = await supabase.from("conversation_list").select("members").eq("id", conversationId).maybeSingle();
  if (error) throw requestError("Members", error);
  return data ? z.object({ members: z.array(memberSchema) }).parse(data).members : [];
}

async function signedUrls(rows: MessageRow[]) {
  const paths = rows.flatMap((row) => (row.removed_at ? [] : row.image_paths));
  if (paths.length === 0) return new Map<string, string>();
  const { data } = await supabase.storage.from("message-media").createSignedUrls(paths, SIGNED_URL_SECONDS);
  return new Map((data ?? []).flatMap((item) => (item.path && item.signedUrl ? [[item.path, item.signedUrl] as const] : [])));
}

async function replyQuotes(rows: MessageRow[]) {
  const ids = [...new Set(rows.flatMap((row) => (row.reply_to_id ? [row.reply_to_id] : [])))];
  if (ids.length === 0) return new Map<string, ReplyQuote>();
  const { data } = await supabase.from("messages").select("id, sender_id, body, image_paths, removed_at").in("id", ids);
  return new Map(lenient(replyQuoteSchema, data).map((quote) => [quote.id, quote] as const));
}

async function hydrate(rows: MessageRow[]): Promise<Message[]> {
  const [urls, quotes] = await Promise.all([signedUrls(rows), replyQuotes(rows)]);
  return toMessages(rows, urls, quotes);
}

export async function loadMessages(conversationId: string, before: string | null = null): Promise<MessagePage> {
  let query = supabase.from("messages").select(MESSAGE_SELECT).eq("conversation_id", conversationId).order("created_at", { ascending: false }).limit(MESSAGE_PAGE);
  if (before) query = query.lt("created_at", before);
  const { data, error } = await query;
  if (error) throw requestError("Messages", error);
  const rows = lenient(messageRowSchema, data);
  const messages = (await hydrate(rows)).reverse();
  return { messages, next: rows.length === MESSAGE_PAGE ? (messages[0]?.createdAt ?? null) : null };
}

export async function loadMessagesAfter(conversationId: string, after: string | null): Promise<Message[]> {
  let query = supabase.from("messages").select(MESSAGE_SELECT).eq("conversation_id", conversationId).order("created_at", { ascending: true }).limit(MESSAGE_PAGE);
  if (after) query = query.gt("created_at", after);
  const { data, error } = await query;
  if (error) throw requestError("Messages", error);
  return hydrate(lenient(messageRowSchema, data));
}

export async function loadMessage(conversationId: string, messageId: string): Promise<Message | null> {
  const { data } = await supabase.from("messages").select(MESSAGE_SELECT).eq("conversation_id", conversationId).eq("id", messageId).maybeSingle();
  const row = messageRowSchema.safeParse(data).data;
  if (!row) return null;
  const [message] = await hydrate([row]);
  return message ?? null;
}

// Reactions are re-read when someone says theirs changed: Realtime can't
// apply row level security to deletions, so they aren't streamed.
export async function loadReactions(conversationId: string, messageIds: string[]): Promise<Record<string, Reaction[]>> {
  if (messageIds.length === 0) return {};
  const { data, error } = await supabase
    .from("message_reactions")
    .select("message_id, emoji, user_id, message:messages!inner(conversation_id)")
    .eq("message.conversation_id", conversationId)
    .in("message_id", messageIds);
  if (error) throw requestError("Reactions", error);
  const reactions: Record<string, Reaction[]> = Object.fromEntries(messageIds.map((messageId) => [messageId, []]));
  for (const row of lenient(reactionRowSchema, data)) reactions[row.message_id]?.push({ emoji: row.emoji, userId: row.user_id });
  return reactions;
}

export async function sendMessage(viewerId: string, input: NewMessage): Promise<Result<Message>> {
  const parsed = newMessageSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Check your message and try again.");
  const message = parsed.data;
  const { data, error } = await supabase
    .from("messages")
    .insert({
      conversation_id: message.conversationId,
      sender_id: viewerId,
      body: message.body,
      image_paths: message.imagePaths,
      image_alts: message.imageAlts.some(Boolean) ? message.imageAlts : [],
      reply_to_id: message.replyToId,
    })
    .select("id")
    .single();
  if (error) return failFrom(error);
  const messageId = z.object({ id }).parse(data).id;
  // Its link card, if the message has a link.
  runTasks(messageId);
  const sent = await loadMessage(message.conversationId, messageId);
  return sent ? ok(sent) : fail("Your message was sent, but it couldn't be shown. Pull down to refresh.");
}

export async function setReaction(viewerId: string, messageId: string, emoji: string, on: boolean): Promise<Result> {
  const row = { message_id: id.parse(messageId), user_id: viewerId, emoji };
  const { error } = on ? await supabase.from("message_reactions").upsert(row, { onConflict: "message_id,user_id,emoji", ignoreDuplicates: true }) : await supabase.from("message_reactions").delete().match(row);
  return error ? failFrom(error) : done;
}

// Reading up to the newest message's own timestamp keeps unread counts and
// "Seen" exact. `moved` says the unread badge has changed, and `announce`
// whether to tell the others to re-read receipts: only when the read
// position moved and the viewer shares them.
export async function markRead(viewerId: string, conversationId: string): Promise<{ moved: boolean; announce: boolean }> {
  const { data } = await supabase.from("messages").select("created_at").eq("conversation_id", conversationId).order("created_at", { ascending: false }).limit(1).maybeSingle();
  const newest = z.object({ created_at: z.string() }).nullable().catch(null).parse(data);
  if (!newest) return { moved: false, announce: false };
  const { data: moved, error } = await supabase
    .from("conversation_participants")
    .update({ last_read_at: newest.created_at })
    .eq("conversation_id", conversationId)
    .eq("status", "accepted")
    .lt("last_read_at", newest.created_at)
    .select("user_id");
  if (error || !moved?.length) return { moved: false, announce: false };
  const { data: settings } = await supabase.from("profile_settings").select("read_receipts").eq("id", viewerId).maybeSingle();
  return { moved: true, announce: z.object({ read_receipts: z.boolean() }).nullable().catch(null).parse(settings)?.read_receipts ?? false };
}

async function rpc(name: string, args: Record<string, unknown>): Promise<Result> {
  const { error } = await supabase.rpc(name, args);
  return error ? failFrom(error) : done;
}

async function started(name: string, args: Record<string, unknown>): Promise<Result<{ id: string }>> {
  const { data, error } = await supabase.rpc(name, args);
  if (error) return failFrom(error);
  const conversation = id.safeParse(data);
  return conversation.success ? ok({ id: conversation.data }) : fail("That conversation couldn't be opened.");
}

export const startConversation = (profileId: string) => started("start_direct_conversation", { p_user_id: id.parse(profileId) });

export function createGroup(title: string, memberIds: string[]) {
  const parsed = newGroupSchema.safeParse({ title, memberIds });
  if (!parsed.success) return Promise.resolve(fail(parsed.error.issues[0]?.message ?? "Choose who to add."));
  return started("create_group_conversation", { p_title: parsed.data.title, p_member_ids: parsed.data.memberIds });
}

// People added read from when they join unless the history is shared with them.
export const addMembers = (conversationId: string, memberIds: string[], shareHistory: boolean) =>
  rpc("add_group_members", { p_conversation_id: id.parse(conversationId), p_member_ids: memberIdsSchema.parse(memberIds), p_share_history: shareHistory });

export function renameGroup(conversationId: string, title: string) {
  const parsed = groupTitleSchema.safeParse(title);
  if (!parsed.success) return Promise.resolve(fail(parsed.error.issues[0]?.message ?? "Check the name."));
  return rpc("rename_group", { p_conversation_id: id.parse(conversationId), p_title: parsed.data });
}

export const removeMember = (conversationId: string, userId: string) => rpc("remove_group_member", { p_conversation_id: id.parse(conversationId), p_user_id: id.parse(userId) });
export const setRole = (conversationId: string, userId: string, role: "admin" | "member") => rpc("set_group_role", { p_conversation_id: id.parse(conversationId), p_user_id: id.parse(userId), p_role: role });
// Declining is private: the sender isn't told.
export const respondToRequest = (conversationId: string, accept: boolean) => rpc("respond_to_message_request", { p_conversation_id: id.parse(conversationId), p_accept: accept });

// Row level security limits these to the viewer's own participant row.
async function participation(conversationId: string, changes: { archived_at: string | null } | { muted: boolean }): Promise<Result> {
  const { error } = await supabase.from("conversation_participants").update(changes).eq("conversation_id", id.parse(conversationId)).eq("status", "accepted");
  return error ? failFrom(error) : done;
}

export const setArchived = (conversationId: string, archived: boolean) => participation(conversationId, { archived_at: archived ? new Date().toISOString() : null });
export const setMuted = (conversationId: string, muted: boolean) => participation(conversationId, { muted });

// People to message: people only, never the viewer.
export async function searchPeople(viewerId: string, query: string): Promise<PersonSummary[]> {
  const text = query.trim();
  if (text.length === 0 || text.length > 50) return [];
  const { data } = await supabase.rpc("search_profiles", { p_query: text, p_limit: 10 });
  return parsePeople(data).filter((person) => person.accountType === "person" && person.id !== viewerId);
}
