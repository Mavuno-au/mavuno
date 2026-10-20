import type { Metadata } from "next";
import { permanentRedirect } from "next/navigation";
import { Mailbox } from "./mailbox";

export const metadata: Metadata = { title: "Messages" };

export default async function MessagesPage({ searchParams }: PageProps<"/messages">) {
  // Links from before each box had its own address.
  const { tab } = await searchParams;
  if (tab === "requests" || tab === "archived") permanentRedirect(`/messages/${tab}`);
  return <Mailbox box="inbox" />;
}
