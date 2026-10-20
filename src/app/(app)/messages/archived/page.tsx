import type { Metadata } from "next";
import { Mailbox } from "../mailbox";

export const metadata: Metadata = { title: "Archived messages" };

export default function ArchivedPage() {
  return <Mailbox box="archived" />;
}
