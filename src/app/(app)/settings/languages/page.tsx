import { LanguagesForm } from "@/components/settings/languages-form";
import { loadPrivateSettings } from "@/lib/data/settings";
import { requireViewer } from "@/lib/viewer";

export const metadata = { title: "Language settings" };

export default async function LanguageSettingsPage() {
  const viewer = await requireViewer("/settings/languages");
  return <LanguagesForm settings={await loadPrivateSettings(viewer)} spoken={viewer.languages} />;
}
