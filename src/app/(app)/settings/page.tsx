import { ProfileForm } from "@/components/settings/profile-form";
import { loadEditableProfile } from "@/lib/data/settings";
import { loadCities } from "@/lib/data/shell";
import { requireViewer } from "@/lib/viewer";

export const metadata = { title: "Profile settings" };

export default async function ProfileSettingsPage() {
  const viewer = await requireViewer("/settings");
  const [profile, cities] = await Promise.all([loadEditableProfile({ id: viewer.id }), loadCities()]);
  if (!profile) throw new Error("Your profile could not be loaded.");
  return <ProfileForm profile={profile} cities={cities} />;
}
