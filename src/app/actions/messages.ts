"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { loadMembers, loadMessage, loadMessages, loadMessagesAfter, type Member, type Message, type MessagePage } from "@/lib/data/messages";
import { parsePeople, type PersonSummary } from "@/lib/domain";
import { LIMITS } from "@/lib/catalogue";
import { done, fail, failFrom, ok, type Result } from "@/lib/result";
import { createClient } from "@/lib/supabase/server";
import { getViewer } from "@/lib/viewer";

const id = z.uuid();
const ids = z.array(id).min(1).max(99);
const groupTitle = z.string().trim().max(60, "Group names can be up to 60 characters.");

async function rpc(name: string, args: Record<string, unknown>): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase.rpc(name, args);
  if (error) return failFrom(error);
  revalidatePath("/messages", "layout");
  return done;
}

async function startedConversation(call: PromiseLike<{ data: unknown; error: { code?: string; message: string } | null }>): Promise<Result<{ id: string }>> {
  const { data, error } = await call;
  if (error) return failFrom(error);
  return ok({ id: id.parse(data) });
}

export async function startConversation(profileId: string): Promise<Result<{ id: string }>> {
  const parsed = id.safeParse(profileId);
  if (!parsed.success) return fail("That person could not be found.");
  const supabase = await createClient();
  return startedConversation(supabase.rpc("start_direct_conversation", { p_user_id: parsed.data }));
}

const newGroupSchema = z.object({ title: groupTitle, memberIds: ids });

export async function createGroup(input: z.input<typeof newGroupSchema>): Promise<Result<{ id: string }>> {
  const parsed = newGroupSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Choose who to add.");
  const supabase = await createClient();
  return startedConversation(supabase.rpc("create_group_conversation", { p_title: parsed.data.title, p_member_ids: parsed.data.memberIds }));
}

export async function addMembers(conversationId: string, memberIds: string[]) {
  return rpc("add_group_members", { p_conversation_id: id.parse(conversationId), p_member_ids: ids.parse(memberIds) });
}

export async function renameGroup(conversationId: string, title: string) {
  const parsed = groupTitle.safeParse(title);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Check the name.");
  return rpc("rename_group", { p_conversation_id: id.parse(conversationId), p_title: parsed.data });
}

export async function removeMember(conversationId: string, userId: string) {
  return rpc("remove_group_member", { p_conversation_id: id.parse(conversationId), p_user_id: id.parse(userId) });
}

export async function setRole(conversationId: string, userId: string, role: "admin" | "member") {
  return rpc("set_group_role", { p_conversation_id: id.parse(conversationId), p_user_id: id.parse(userId), p_role: z.enum(["admin", "member"]).parse(role) });
}

export async function respondToRequest(conversationId: string, accept: boolean) {
  return rpc("respond_to_message_request", { p_conversation_id: id.parse(conversationId), p_accept: z.boolean().parse(accept) });
}

// Row level security limits these updates to the viewer's own participant row.
async function updateParticipation(conversationId: string, changes: { archived_at: string | null } | { muted: boolean }): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase.from("conversation_participants").update(changes).eq("conversation_id", id.parse(conversationId)).eq("status", "accepted");
  if (error) return failFrom(error);
  revalidatePath("/messages", "layout");
  return done;
}

export async function setArchived(conversationId: string, archived: boolean) {
  return updateParticipation(conversationId, { archived_at: z.boolean().parse(archived) ? new Date().toISOString() : null });
}

export async function setMuted(conversationId: string, muted: boolean) {
  return updateParticipation(conversationId, { muted: z.boolean().parse(muted) });
}

// Reading up to the newest message's own timestamp keeps unread counts and
// "Seen" exact, whatever the app server's clock says. `announce` says whether
// the others should be told to re-read receipts: only when the read position
// moved and the viewer shares read receipts.
export async function markRead(conversationId: string): Promise<Result<{ announce: boolean }>> {
  const conversation = id.parse(conversationId);
  const supabase = await createClient();
  const { data } = await supabase.from("messages").select("created_at").eq("conversation_id", conversation).order("created_at", { ascending: false }).limit(1).maybeSingle();
  const newest = z.object({ created_at: z.string() }).nullable().parse(data);
  if (!newest) return ok({ announce: false });
  const { data: moved, error } = await supabase
    .from("conversation_participants")
    .update({ last_read_at: newest.created_at })
    .eq("conversation_id", conversation)
    .eq("status", "accepted")
    .lt("last_read_at", newest.created_at)
    .select("user_id");
  if (error) return failFrom(error);
  const viewer = await getViewer();
  if (!moved?.length || !viewer) return ok({ announce: false });
  const { data: settings } = await supabase.from("profile_settings").select("read_receipts").eq("id", viewer.id).maybeSingle();
  return ok({ announce: z.object({ read_receipts: z.boolean() }).nullable().parse(settings)?.read_receipts ?? false });
}

export async function fetchMembers(conversationId: string): Promise<Member[]> {
  return loadMembers(id.parse(conversationId));
}

const newMessageSchema = z
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

export async function sendMessage(input: NewMessage): Promise<Result<Message>> {
  const parsed = newMessageSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Check your message and try again.");
  const viewer = await getViewer();
  if (!viewer) return fail("Sign in first.");
  const message = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("messages")
    .insert({ conversation_id: message.conversationId, sender_id: viewer.id, body: message.body, image_paths: message.imagePaths, image_alts: message.imageAlts.some(Boolean) ? message.imageAlts : [], reply_to_id: message.replyToId })
    .select("id")
    .single();
  if (error) return failFrom(error);
  const sent = await loadMessage(message.conversationId, z.object({ id }).parse(data).id);
  return sent ? ok(sent) : fail("Your message was sent, but it could not be shown. Refresh the page.");
}

export async function fetchMessage(conversationId: string, messageId: string): Promise<Message | null> {
  return loadMessage(id.parse(conversationId), id.parse(messageId));
}

export async function loadNewerMessages(conversationId: string, after: string | null): Promise<Message[]> {
  return loadMessagesAfter(id.parse(conversationId), z.string().max(64).nullable().parse(after));
}

export async function loadOlderMessages(conversationId: string, before: string): Promise<MessagePage> {
  return loadMessages(id.parse(conversationId), z.string().max(64).parse(before));
}

export async function setReaction(messageId: string, emoji: string, on: boolean): Promise<Result> {
  const viewer = await getViewer();
  if (!viewer) return fail("Sign in first.");
  const row = { message_id: id.parse(messageId), user_id: viewer.id, emoji: z.string().min(1).max(16).parse(emoji) };
  const supabase = await createClient();
  const { error } = z.boolean().parse(on)
    ? await supabase.from("message_reactions").upsert(row, { onConflict: "message_id,user_id,emoji", ignoreDuplicates: true })
    : await supabase.from("message_reactions").delete().match(row);
  return error ? failFrom(error) : done;
}

export async function searchPeople(query: string): Promise<PersonSummary[]> {
  const parsed = z.string().trim().min(1).max(50).safeParse(query);
  const viewer = await getViewer();
  if (!parsed.success || !viewer) return [];
  const supabase = await createClient();
  const { data } = await supabase.rpc("search_profiles", { p_query: parsed.data, p_limit: 10 });
  return parsePeople(data).filter((person) => person.accountType === "person" && person.id !== viewer.id);
}
