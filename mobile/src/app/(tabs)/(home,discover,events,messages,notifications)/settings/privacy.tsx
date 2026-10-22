import { Check } from "lucide-react-native";
import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, View } from "react-native";
import { loadPrivateSettings, type PrivateSettings } from "@/data/profiles";
import { useViewer } from "@/data/session";
import { updatePrivacy } from "@/data/settings";
import { Group, ToggleRow } from "@/ui/form";
import { BackButton, Header } from "@/ui/header";
import { Text } from "@/ui/text";
import { usePalette } from "@/ui/theme";

// The website's wording (src/components/settings/privacy-form.tsx).
const DM_POLICIES = [
  { value: "everyone", label: "Everyone", hint: "Anyone can message you. People you don't follow land in Requests and can send one message until you accept." },
  { value: "following", label: "People I follow", hint: "Only people you follow can start a conversation with you." },
  { value: "nobody", label: "Nobody", hint: "No one can start a new conversation. Conversations you already have carry on." },
] as const;

// Each change saves as soon as it's made, as an iOS setting does.
export default function PrivacySettings() {
  const palette = usePalette();
  const viewer = useViewer();
  const [settings, setSettings] = useState<PrivateSettings | null>(null);
  const viewerId = viewer?.id ?? null;

  useEffect(() => {
    if (!viewerId) return;
    void loadPrivateSettings(viewerId)
      .then(setSettings)
      .catch(() => Alert.alert("Couldn't load your settings", "Check your connection, then try again."));
  }, [viewerId]);

  async function save(next: PrivateSettings) {
    if (!viewerId || !settings) return;
    const previous = settings;
    setSettings(next);
    const result = await updatePrivacy(viewerId, { dmPolicy: next.dmPolicy, discoverable: next.discoverable, readReceipts: next.readReceipts });
    if (!result.ok) {
      setSettings(previous);
      Alert.alert("Couldn't save that", result.error);
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: palette.shell }}>
      <Header title="Privacy" left={<BackButton fallback="/settings" />} />
      {!settings ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={palette.inkMuted} />
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, gap: 24, paddingBottom: 48 }}>
          <Group title="Who can message me">
            {DM_POLICIES.map((policy, index) => {
              const selected = settings.dmPolicy === policy.value;
              return (
                <Pressable
                  key={policy.value}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  onPress={() => void save({ ...settings, dmPolicy: policy.value })}
                  style={({ pressed }) => ({ flexDirection: "row", gap: 12, padding: 16, borderBottomWidth: index === DM_POLICIES.length - 1 ? 0 : 1, borderBottomColor: palette.hairline, backgroundColor: pressed ? palette.wash : "transparent" })}
                >
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text variant="body">{policy.label}</Text>
                    <Text variant="small" tone="muted">
                      {policy.hint}
                    </Text>
                  </View>
                  {selected ? <Check size={20} color={palette.primary} /> : null}
                </Pressable>
              );
            })}
          </Group>
          <Group title="Being found" footer="Your city is the most precise location Mavuno ever shows. Your address and exact location are never stored.">
            <ToggleRow
              label="Show me in Nearby and in suggestions"
              hint="People in and around your city can find you, and Mavuno can suggest you to people with shared interests. Your profile stays public either way."
              value={settings.discoverable}
              onChange={(discoverable) => void save({ ...settings, discoverable })}
              last
            />
          </Group>
          <Group title="Messages">
            <ToggleRow
              label="Send read receipts"
              hint="Others see when you've read their messages. Turn this off and you won't see theirs either."
              value={settings.readReceipts}
              onChange={(readReceipts) => void save({ ...settings, readReceipts })}
              last
            />
          </Group>
        </ScrollView>
      )}
    </View>
  );
}
