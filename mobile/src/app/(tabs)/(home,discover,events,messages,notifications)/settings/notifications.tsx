import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, AppState, Linking, ScrollView, View } from "react-native";
import { askForPush, loadPushOff, PUSH_GROUPS, pushAvailable, pushPermission, savePushOff, type PushKind, type PushPermission } from "@/data/push";
import { useViewer } from "@/data/session";
import { Group, Row, ToggleRow } from "@/ui/form";
import { BackButton, Header } from "@/ui/header";
import { Text } from "@/ui/text";
import { usePalette } from "@/ui/theme";

// One switch per kind, saved as soon as it changes. They are the member's,
// so they hold on every phone; whether this phone may notify at all is iOS's.
export default function NotificationSettings() {
  const palette = usePalette();
  const viewer = useViewer();
  const viewerId = viewer?.id ?? null;
  const [off, setOff] = useState<string[] | null>(null);
  const [permission, setPermission] = useState<PushPermission | null>(null);

  useEffect(() => {
    if (!viewerId) return;
    void loadPushOff(viewerId)
      .then(setOff)
      .catch(() => Alert.alert("Couldn't load your settings", "Check your connection, then try again."));
  }, [viewerId]);

  // Coming back from iOS Settings shows what was chosen there.
  useEffect(() => {
    const read = () => void pushPermission().then(setPermission);
    read();
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") read();
    });
    return () => subscription.remove();
  }, []);

  async function toggle(kind: PushKind, on: boolean) {
    if (!viewerId || !off) return;
    const previous = off;
    const next = on ? off.filter((candidate) => candidate !== kind) : [...off, kind];
    setOff(next);
    const result = await savePushOff(viewerId, next);
    if (!result.ok) {
      setOff(previous);
      Alert.alert("Couldn't save that", result.error);
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: palette.shell }}>
      <Header title="Notifications" left={<BackButton fallback="/settings" />} />
      {!off || !permission ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={palette.inkMuted} accessibilityLabel="Loading" />
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, gap: 24, paddingBottom: 48 }}>
          <Group title="On this phone" footer={footerFor(permission)}>
            {!pushAvailable ? (
              <Row label="Notifications" value="Not available" last />
            ) : permission === "granted" ? (
              <Row label="Notifications" value="On" last />
            ) : permission === "denied" ? (
              <Row label="Turn on in iOS Settings" tone="primary" onPress={() => void Linking.openSettings()} last />
            ) : (
              <Row label="Turn on notifications" tone="primary" onPress={() => void askForPush().then(setPermission)} last />
            )}
          </Group>
          {PUSH_GROUPS.map((group) => (
            <Group key={group.title} title={group.title}>
              {group.kinds.map((item, index) => (
                <ToggleRow
                  key={item.kind}
                  label={item.label}
                  hint={item.hint}
                  value={!off.includes(item.kind)}
                  onChange={(on) => void toggle(item.kind, on)}
                  last={index === group.kinds.length - 1}
                />
              ))}
            </Group>
          ))}
          <Text variant="small" tone="muted" style={{ paddingHorizontal: 16 }}>
            These apply on every phone you use Mavuno on. Notifications reach you through Expo and Apple, and never include what a message says.
          </Text>
        </ScrollView>
      )}
    </View>
  );
}

function footerFor(permission: PushPermission) {
  if (!pushAvailable) return "This version of the app can't send notifications yet.";
  switch (permission) {
    case "granted":
      return "To turn them off on this phone, use iOS Settings.";
    case "denied":
      return "Notifications are off for Mavuno in iOS Settings.";
    case "undetermined":
      return "iOS asks first.";
  }
}
