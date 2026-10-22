import { router } from "expo-router";
import { Building2 } from "lucide-react-native";
import { useState } from "react";
import { Alert, Pressable, ScrollView, View } from "react-native";
import { reloadViewer, useViewer } from "@/data/session";
import { acceptTeamInvitation, declineTeamInvitation } from "@/data/settings";
import { Avatar } from "@/ui/avatar";
import { Button, EmptyState } from "@/ui/controls";
import { Group } from "@/ui/form";
import { BackButton, Header } from "@/ui/header";
import { Text } from "@/ui/text";
import { HAIRLINE, usePalette } from "@/ui/theme";
import { toast } from "@/ui/toast";

const ROLE = { owner: "Owner", admin: "Admin", editor: "Editor" } as const;

// Team invitations to accept or decline, your teams, and Create
// organisation, for churches, mosques, community groups and businesses.
export default function OrganisationSettings() {
  const palette = usePalette();
  const viewer = useViewer();
  const [busy, setBusy] = useState<string | null>(null);
  if (!viewer) return null;

  async function answer(orgId: string, accept: boolean) {
    if (!viewer) return;
    setBusy(orgId);
    const result = accept ? await acceptTeamInvitation(orgId) : await declineTeamInvitation(viewer.id, orgId);
    setBusy(null);
    if (!result.ok) return Alert.alert("Couldn't answer the invitation", result.error);
    toast(accept ? "You're on the team" : "Invitation declined");
    reloadViewer();
  }

  return (
    <View style={{ flex: 1, backgroundColor: palette.shell }}>
      <Header title="Organisations" left={<BackButton fallback="/settings" />} />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 24, paddingBottom: 48 }}>
        {viewer.invitations.length > 0 ? (
          <Group title="Invitations">
            {viewer.invitations.map((organisation, index) => (
              <View key={organisation.id} style={{ padding: 16, gap: 10, borderBottomWidth: index === viewer.invitations.length - 1 ? 0 : HAIRLINE, borderBottomColor: palette.hairline }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                  <Avatar person={{ ...organisation, accountType: "organisation" }} size={40} />
                  <Text variant="callout" style={{ flex: 1 }}>
                    <Text variant="name">{organisation.displayName}</Text> invited you to its team as {ROLE[organisation.role].toLowerCase()}.
                  </Text>
                </View>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  <Button label="Accept" size="medium" busy={busy === organisation.id} onPress={() => void answer(organisation.id, true)} />
                  <Button label="Decline" size="medium" variant="outline" disabled={busy === organisation.id} onPress={() => void answer(organisation.id, false)} />
                </View>
              </View>
            ))}
          </Group>
        ) : null}
        {viewer.organisations.length > 0 ? (
          <Group title="Your teams">
            {viewer.organisations.map((organisation, index) => (
              <Pressable
                key={organisation.id}
                accessibilityRole="button"
                onPress={() => router.push(`/settings/organisation/${organisation.username}`)}
                style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderBottomWidth: index === viewer.organisations.length - 1 ? 0 : HAIRLINE, borderBottomColor: palette.hairline, backgroundColor: pressed ? palette.wash : "transparent" })}
              >
                <Avatar person={{ ...organisation, accountType: "organisation" }} size={40} />
                <View style={{ flex: 1 }}>
                  <Text variant="name">{organisation.displayName}</Text>
                  <Text variant="caption" tone="muted">
                    @{organisation.username} · {ROLE[organisation.role]}
                  </Text>
                </View>
              </Pressable>
            ))}
          </Group>
        ) : (
          <EmptyState icon={<Building2 size={26} color={palette.inkMuted} />} title="No organisations yet">
            Churches, mosques, community groups and businesses can have their own profile, run by a team.
          </EmptyState>
        )}
        <Button label="Create an organisation" variant="outline" onPress={() => router.push("/organisation-form")} />
      </ScrollView>
    </View>
  );
}
