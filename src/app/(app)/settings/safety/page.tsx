import Link from "next/link";
import { SettingsGroup } from "@/components/settings/layout";
import { SafetyLists } from "@/components/settings/safety-lists";
import { loadSafetyLists } from "@/lib/data/settings";
import { requireViewer } from "@/lib/viewer";

export const metadata = { title: "Safety" };

export default async function SafetySettingsPage() {
  const viewer = await requireViewer("/settings/safety");
  const { muted, blocked } = await loadSafetyLists(viewer);
  return (
    <>
      <SafetyLists muted={muted} blocked={blocked} />
      <SettingsGroup title="Reporting">
        <p className="text-[15px] text-ink-muted">
          If someone breaks the <Link href="/rules" className="text-primary hover:underline">community rules</Link>, report the post, message or profile from its menu. Moderators never see who reported it.
        </p>
      </SettingsGroup>
    </>
  );
}
