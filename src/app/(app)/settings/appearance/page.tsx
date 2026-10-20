import { cookies } from "next/headers";
import { SettingsGroup } from "@/components/settings/layout";
import { ThemePicker } from "@/components/settings/theme-picker";
import { WhoToFollowToggle } from "@/components/settings/who-to-follow-toggle";
import { HIDDEN_COOKIE, isHidden } from "@/lib/who-to-follow";

export const metadata = { title: "Appearance" };

export default async function AppearanceSettingsPage() {
  const hidden = isHidden((await cookies()).get(HIDDEN_COOKIE)?.value);
  return (
    <>
      <SettingsGroup title="Theme" hint="Saved in this browser, so each device keeps its own. System follows your device's light or dark setting.">
        <ThemePicker />
      </SettingsGroup>
      <SettingsGroup title="Who to follow" hint="Saved in this browser, like the theme.">
        <WhoToFollowToggle shown={!hidden} />
      </SettingsGroup>
    </>
  );
}
