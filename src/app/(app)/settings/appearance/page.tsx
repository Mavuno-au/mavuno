import { cookies } from "next/headers";
import { SettingsGroup } from "@/components/settings/layout";
import { ReplyPreviewPicker } from "@/components/settings/reply-preview-picker";
import { ShortcutsToggle } from "@/components/settings/shortcuts-toggle";
import { ThemePicker } from "@/components/settings/theme-picker";
import { WhoToFollowToggle } from "@/components/settings/who-to-follow-toggle";
import { parseReplyPreviewCount, REPLY_PREVIEWS_COOKIE } from "@/lib/reply-previews";
import { HIDDEN_COOKIE, isHidden } from "@/lib/who-to-follow";

export const metadata = { title: "Appearance" };

export default async function AppearanceSettingsPage() {
  const jar = await cookies();
  const hidden = isHidden(jar.get(HIDDEN_COOKIE)?.value);
  return (
    <>
      <SettingsGroup title="Theme" hint="Saved in this browser, so each device keeps its own. System follows your device's light or dark setting.">
        <ThemePicker />
      </SettingsGroup>
      <SettingsGroup title="Replies in feeds" hint="How many of the newest replies show under each post. Saved in this browser, like the theme.">
        <ReplyPreviewPicker count={parseReplyPreviewCount(jar.get(REPLY_PREVIEWS_COOKIE)?.value)} />
      </SettingsGroup>
      <SettingsGroup title="Who to follow" hint="Saved in this browser, like the theme.">
        <WhoToFollowToggle shown={!hidden} />
      </SettingsGroup>
      <SettingsGroup title="Keyboard" hint="Saved in this browser, like the theme.">
        <ShortcutsToggle />
      </SettingsGroup>
    </>
  );
}
