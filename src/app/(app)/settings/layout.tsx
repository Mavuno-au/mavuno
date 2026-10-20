import type { Metadata } from "next";
import { SettingsTabs } from "@/components/settings/settings-tabs";
import { PageHeader } from "@/components/ui/page";
import { requireViewer } from "@/lib/viewer";

export const metadata: Metadata = { title: "Settings", robots: { index: false } };

export default async function SettingsLayout({ children }: LayoutProps<"/settings">) {
  await requireViewer("/settings");
  return (
    <>
      <PageHeader title="Settings">
        <SettingsTabs />
      </PageHeader>
      {children}
    </>
  );
}
