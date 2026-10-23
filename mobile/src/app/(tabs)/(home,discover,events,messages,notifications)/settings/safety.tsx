import { router } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, View } from "react-native";
import { reasonOf, type Reason } from "@/data/errors";
import { setRelation } from "@/data/relations";
import { useViewer } from "@/data/session";
import { loadSafetyLists, type Relation } from "@/data/settings";
import { siteLink } from "@/data/env";
import { Avatar } from "@/ui/avatar";
import { Button, LoadFailed } from "@/ui/controls";
import { Group, Row } from "@/ui/form";
import { BackButton, Header } from "@/ui/header";
import { Text } from "@/ui/text";
import { HAIRLINE, usePalette } from "@/ui/theme";
import { openLink } from "@/util/links";

// Muted and blocked people with Unmute and Unblock, how reporting works,
// and a way to appeals and decisions.
export default function SafetySettings() {
  const palette = usePalette();
  const viewer = useViewer();
  const [lists, setLists] = useState<{ muted: Relation[]; blocked: Relation[] } | null>(null);
  const [failed, setFailed] = useState<Reason | null>(null);
  const viewerId = viewer?.id ?? null;

  const read = useCallback(() => {
    if (!viewerId) return;
    void loadSafetyLists(viewerId).then(setLists, (error: unknown) => setFailed(reasonOf(error)));
  }, [viewerId]);

  useEffect(read, [read]);

  async function undo(relation: "mute" | "block", profileId: string) {
    if (!viewerId) return;
    const result = await setRelation(relation, viewerId, profileId, false);
    if (!result.ok) return Alert.alert(relation === "mute" ? "Couldn't unmute" : "Couldn't unblock", result.error);
    read();
  }

  const person = (relation: Relation, kind: "mute" | "block", last: boolean) => (
    <View key={relation.profile.id} style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: last ? 0 : HAIRLINE, borderBottomColor: palette.hairline }}>
      <Pressable accessibilityRole="link" onPress={() => router.push(`/profile/${relation.profile.username}`)} style={{ flexDirection: "row", alignItems: "center", gap: 12, flex: 1 }}>
        <Avatar person={relation.profile} size={36} />
        <View style={{ flex: 1 }}>
          <Text variant="name" numberOfLines={1}>
            {relation.profile.displayName}
          </Text>
          <Text variant="meta" tone="muted" numberOfLines={1}>
            @{relation.profile.username}
          </Text>
        </View>
      </Pressable>
      <Button label={kind === "mute" ? "Unmute" : "Unblock"} variant="outline" size="medium" onPress={() => void undo(kind, relation.profile.id)} />
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: palette.shell }}>
      <Header title="Muted and blocked" left={<BackButton fallback="/settings" />} />
      {failed && !lists ? (
        <LoadFailed
          title="These didn't load"
          reason={failed}
          onRetry={() => {
            setFailed(null);
            read();
          }}
        />
      ) : !lists ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={palette.inkMuted} accessibilityLabel="Loading" />
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, gap: 24, paddingBottom: 48 }}>
          <Group title="Muted" footer="You don't see their posts. They aren't told.">
            {lists.muted.length === 0 ? (
              <Text variant="callout" tone="muted" style={{ padding: 16 }}>
                Nobody muted.
              </Text>
            ) : (
              lists.muted.map((relation, index) => person(relation, "mute", index === lists.muted.length - 1))
            )}
          </Group>
          <Group title="Blocked" footer="Neither of you can see, follow, message or reply to the other. They aren't told.">
            {lists.blocked.length === 0 ? (
              <Text variant="callout" tone="muted" style={{ padding: 16 }}>
                Nobody blocked.
              </Text>
            ) : (
              lists.blocked.map((relation, index) => person(relation, "block", index === lists.blocked.length - 1))
            )}
          </Group>
          <Group title="Reports and decisions">
            <Row label="How reporting works" onPress={() => openLink(siteLink("/help/reporting"))} />
            <Row label="Appeals and decisions" onPress={() => openLink(siteLink("/help/appeals"))} last />
          </Group>
        </ScrollView>
      )}
    </View>
  );
}
