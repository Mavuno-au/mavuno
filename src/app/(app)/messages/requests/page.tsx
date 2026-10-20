import type { Metadata } from "next";
import { Mailbox } from "../mailbox";

export const metadata: Metadata = { title: "Message requests" };

export default function RequestsPage() {
  return <Mailbox box="requests" />;
}
