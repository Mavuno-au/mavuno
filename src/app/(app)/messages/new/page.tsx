import type { Metadata } from "next";
import { NewConversation } from "@/components/messages/new-conversation";
import { PageHeader } from "@/components/ui/page";
import { requireViewer } from "@/lib/viewer";

export const metadata: Metadata = { title: "New message" };

export default async function NewMessagePage() {
  await requireViewer("/messages/new");
  return (
    <>
      <PageHeader title="New message" back="/messages" />
      <NewConversation />
    </>
  );
}
