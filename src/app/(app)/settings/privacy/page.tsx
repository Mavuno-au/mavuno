import { PrivacyForm } from "@/components/settings/privacy-form";
import { loadPrivateSettings } from "@/lib/data/settings";
import { requireViewer } from "@/lib/viewer";

export const metadata = { title: "Privacy settings" };

export default async function PrivacySettingsPage() {
  const viewer = await requireViewer("/settings/privacy");
  return <PrivacyForm settings={await loadPrivateSettings(viewer)} />;
}
