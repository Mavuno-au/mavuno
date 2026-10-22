import { Check } from "lucide-react-native";
import { Pressable, ScrollView, View } from "react-native";
import { REPLY_PREVIEW_CHOICES } from "@/lib/reply-previews";
import { setPreference, usePreferences, type Theme } from "@/data/preferences";
import { Group } from "@/ui/form";
import { BackButton, Header } from "@/ui/header";
import { Text } from "@/ui/text";
import { usePalette } from "@/ui/theme";

const THEMES: { value: Theme; label: string }[] = [
  { value: "system", label: "Match my phone" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

const PREVIEWS: Record<(typeof REPLY_PREVIEW_CHOICES)[number], string> = { 0: "None", 3: "3 replies", 5: "5 replies" };

// Theme, and how many replies show under each post, as on the website. Text
// size follows the iPhone's own setting, so Dynamic Type works everywhere.
export default function AppearanceSettings() {
  const palette = usePalette();
  const preferences = usePreferences();
  const choice = (label: string, selected: boolean, onPress: () => void, last: boolean) => (
    <Pressable
      key={label}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", minHeight: 52, paddingHorizontal: 16, borderBottomWidth: last ? 0 : 1, borderBottomColor: palette.hairline, backgroundColor: pressed ? palette.wash : "transparent" })}
    >
      <Text variant="body" style={{ flex: 1 }}>
        {label}
      </Text>
      {selected ? <Check size={20} color={palette.primary} /> : null}
    </Pressable>
  );
  return (
    <View style={{ flex: 1, backgroundColor: palette.shell }}>
      <Header title="Appearance" left={<BackButton fallback="/settings" />} />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 24, paddingBottom: 48 }}>
        <Group title="Theme">{THEMES.map((theme, index) => choice(theme.label, preferences.theme === theme.value, () => setPreference("theme", theme.value), index === THEMES.length - 1))}</Group>
        <Group title="Replies under each post" footer="How many of the newest replies show under a post in your feeds.">
          {REPLY_PREVIEW_CHOICES.map((count, index) => choice(PREVIEWS[count], preferences.replyPreviews === count, () => setPreference("replyPreviews", count), index === REPLY_PREVIEW_CHOICES.length - 1))}
        </Group>
        <Text variant="small" tone="muted">
          To make text bigger or smaller, change the text size in your iPhone's Settings, under Display and Brightness. Mavuno follows it.
        </Text>
      </ScrollView>
    </View>
  );
}
