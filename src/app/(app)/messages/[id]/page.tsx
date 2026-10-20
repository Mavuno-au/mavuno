import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { ThreadView } from "@/components/messages/thread-view";
import { loadConversation, loadMessages } from "@/lib/data/messages";
import { requireViewer } from "@/lib/viewer";

export const metadata: Metadata = { title: "Messages" };

export default async function ConversationPage({ params }: PageProps<"/messages/[id]">) {
  const { id: raw } = await params;
  const viewer = await requireViewer(`/messages/${encodeURIComponent(raw)}`);
  const id = z.uuid().safeParse(raw);
  if (!id.success) notFound();
  const [conversation, page] = await Promise.all([loadConversation(id.data), loadMessages(id.data)]);
  if (!conversation) notFound();
  return <ThreadView key={conversation.id} conversation={conversation} viewerId={viewer.id} initial={page.messages} next={page.next} />;
}
