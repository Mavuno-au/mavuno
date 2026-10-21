import { notFound } from "next/navigation";
import { SiteRoleForm, SiteSettingsForm, SwitchesForm } from "@/components/moderation/admin-forms";
import { loadSiteSettings } from "@/lib/data/moderation";
import { loadSwitches } from "@/lib/data/operations";
import { getViewer } from "@/lib/viewer";

export const metadata = { title: "Admin" };

export default async function AdminPage() {
  const viewer = await getViewer();
  if (viewer?.role !== "admin") notFound();
  return (
    <>
      <SiteSettingsForm settings={await loadSiteSettings()} />
      <SwitchesForm switches={await loadSwitches()} />
      <SiteRoleForm />
    </>
  );
}
