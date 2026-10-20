import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ModerationTabs } from "@/components/moderation/moderation-tabs";
import { PageHeader } from "@/components/ui/page";
import { getViewer, isModerator } from "@/lib/viewer";

export const metadata: Metadata = { title: "Moderation", robots: { index: false } };

export default async function ModerationLayout({ children }: LayoutProps<"/moderation">) {
  const viewer = await getViewer();
  if (!viewer || !isModerator(viewer)) notFound();
  return (
    <>
      <PageHeader title="Moderation">
        <ModerationTabs admin={viewer.role === "admin"} />
      </PageHeader>
      {children}
    </>
  );
}
