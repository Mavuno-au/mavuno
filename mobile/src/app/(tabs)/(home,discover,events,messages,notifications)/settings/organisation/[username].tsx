import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from "react-native";
import { deleteOrganisation } from "@/data/account";
import { loadTeam, type TeamMember } from "@/data/profiles";
import { reloadViewer, useViewer } from "@/data/session";
import { addTeamMember, handOverOwnership, removeTeamMember, setTeamRole, type TeamRole } from "@/data/settings";
import { Avatar } from "@/ui/avatar";
import { Button, Chip, Segmented } from "@/ui/controls";
import { FieldError, Group, Row, TextField } from "@/ui/form";
import { BackButton, Header } from "@/ui/header";
import { ActionSheet, type SheetAction } from "@/ui/sheet";
import { Text } from "@/ui/text";
import { usePalette } from "@/ui/theme";
import { toast } from "@/ui/toast";

const ROLE = { owner: "Owner", admin: "Admin", editor: "Editor" } as const;

// Managing an organisation: its profile, its team and their roles, handing
// over ownership, and deleting it. Owners and admins manage; editors post.
export default function ManageOrganisation() {
  const palette = usePalette();
  const viewer = useViewer();
  const username = String(useLocalSearchParams().username ?? "");
  const organisation = viewer?.organisations.find((candidate) => candidate.username === username) ?? null;
  const [team, setTeam] = useState<TeamMember[] | null>(null);
  const [adding, setAdding] = useState("");
  const [role, setRole] = useState<TeamRole>("editor");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [member, setMember] = useState<TeamMember | null>(null);
  const orgId = organisation?.id ?? null;

  const read = useCallback(() => {
    if (!orgId) return;
    void loadTeam(orgId).then(setTeam);
  }, [orgId]);

  useEffect(read, [read]);

  if (!viewer || !organisation) {
    return (
      <View style={{ flex: 1, backgroundColor: palette.shell }}>
        <Header title="Organisation" left={<BackButton fallback="/settings/organisations" />} />
        <Text variant="callout" tone="muted" style={{ padding: 24 }}>
          You're not on this organisation's team.
        </Text>
      </View>
    );
  }

  const owner = organisation.role === "owner";
  const manager = owner || organisation.role === "admin";

  async function add() {
    if (!orgId) return;
    setBusy(true);
    setError(null);
    const result = await addTeamMember(orgId, adding, role);
    setBusy(false);
    if (!result.ok) return setError(result.error);
    setAdding("");
    toast("Invitation sent");
    read();
  }

  const run = async (action: () => Promise<{ ok: boolean; error?: string }>, done: string) => {
    const result = await action();
    if (!result.ok) return Alert.alert("Couldn't do that", "error" in result && result.error ? result.error : "Try again.");
    toast(done);
    reloadViewer();
    read();
  };

  const memberActions = (person: TeamMember): SheetAction[] => {
    if (!orgId || person.role === "owner") return [];
    return [
      ...(manager ? [{ label: person.role === "admin" ? "Make editor" : "Make admin", onPress: () => void run(() => setTeamRole(orgId, person.id, person.role === "admin" ? "editor" : "admin"), "Role changed") }] : []),
      ...(owner && !person.invited
        ? [
            {
              label: "Hand over ownership",
              onPress: () =>
                Alert.alert(`Make ${person.displayName} the owner?`, "You'll become an admin. Only the new owner can give it back.", [
                  { text: "Cancel", style: "cancel" },
                  { text: "Hand over", onPress: () => void run(() => handOverOwnership(viewer.id, orgId, person.id), "Ownership handed over") },
                ]),
            },
          ]
        : []),
      ...(manager ? [{ label: person.invited ? "Cancel invitation" : "Remove from team", destructive: true, onPress: () => void run(() => removeTeamMember(orgId, person.id), "Removed") }] : []),
    ];
  };

  function confirmDelete() {
    if (!orgId || !organisation) return;
    Alert.alert(`Delete ${organisation.displayName}?`, "Its profile, posts, events and opportunities are deleted for good. This can't be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () =>
          void deleteOrganisation(orgId).then((result) => {
            if (!result.ok) return Alert.alert("Couldn't delete it", result.error);
            toast("Organisation deleted");
            reloadViewer();
            router.back();
          }),
      },
    ]);
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1, backgroundColor: palette.shell }}>
      <Header title={organisation.displayName} left={<BackButton fallback="/settings/organisations" />} />
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 16, gap: 24, paddingBottom: 48 }}>
        <Group>
          <Row label="View profile" onPress={() => router.push(`/profile/${organisation.username}`)} />
          {manager ? <Row label="Edit profile" onPress={() => router.push({ pathname: "/edit-profile", params: { id: organisation.id } })} last /> : <Row label={`You're an ${ROLE[organisation.role].toLowerCase()}`} last />}
        </Group>
        <Group title="Team">
          {team === null ? (
            <ActivityIndicator style={{ padding: 16 }} color={palette.inkMuted} accessibilityLabel="Loading" />
          ) : (
            team.map((person, index) => (
              <Pressable
                key={person.id}
                accessibilityRole={manager && person.id !== viewer.id ? "button" : undefined}
                disabled={!manager || person.id === viewer.id || person.role === "owner"}
                onPress={() => setMember(person)}
                style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderBottomWidth: index === team.length - 1 ? 0 : 1, borderBottomColor: palette.hairline, backgroundColor: pressed ? palette.wash : "transparent" })}
              >
                <Avatar person={person} size={36} />
                <View style={{ flex: 1 }}>
                  <Text variant="name">{person.id === viewer.id ? `${person.displayName} (you)` : person.displayName}</Text>
                  <Text variant="meta" tone="muted">
                    @{person.username}
                  </Text>
                </View>
                {person.invited ? <Chip tone="warning">Invited</Chip> : <Chip tone={person.role === "owner" ? "primary" : "muted"}>{ROLE[person.role]}</Chip>}
              </Pressable>
            ))
          )}
        </Group>
        {manager ? (
          <View style={{ gap: 10 }}>
            <Text variant="label">Add someone to the team</Text>
            <TextField label="Username" hideLabel value={adding} onChangeText={setAdding} autoCapitalize="none" autoCorrect={false} placeholder="@username" mono />
            <Segmented
              label="Role"
              options={[
                { key: "editor", label: "Editor" },
                { key: "admin", label: "Admin" },
              ]}
              value={role}
              onChange={setRole}
            />
            <Text variant="small" tone="muted">
              Editors post as the organisation. Admins also manage its profile, team, events and opportunities. They're asked to accept first.
            </Text>
            {error ? <FieldError>{error}</FieldError> : null}
            <Button label="Invite" size="medium" busy={busy} disabled={!adding.trim()} onPress={() => void add()} style={{ alignSelf: "flex-start" }} />
          </View>
        ) : null}
        {!owner ? (
          <Button label="Leave the team" variant="destructive" onPress={() => orgId && void run(() => removeTeamMember(orgId, viewer.id), "You left the team").then(() => router.back())} />
        ) : (
          <Group footer="Owners only. Its files are removed first, then the organisation.">
            <Row label="Delete organisation" tone="destructive" onPress={confirmDelete} last />
          </Group>
        )}
      </ScrollView>
      <ActionSheet title={member?.displayName} actions={member ? memberActions(member) : []} open={member !== null} onClose={() => setMember(null)} />
    </KeyboardAvoidingView>
  );
}
