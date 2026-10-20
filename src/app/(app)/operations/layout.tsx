import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { OperationsTabs } from "@/components/operations/operations-tabs";
import { PageHeader } from "@/components/ui/page";
import { getViewer } from "@/lib/viewer";

export const metadata: Metadata = { title: "Operations", robots: { index: false } };

export default async function OperationsLayout({ children }: LayoutProps<"/operations">) {
  const viewer = await getViewer();
  if (viewer?.role !== "admin") notFound();
  return (
    <>
      <PageHeader title="Operations" meta="Admins only">
        <OperationsTabs />
      </PageHeader>
      {children}
    </>
  );
}
