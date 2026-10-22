import { router, useLocalSearchParams } from "expo-router";
import { UserPlus } from "lucide-react-native";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, View } from "react-native";
import { z } from "zod";
import type { PersonSummary } from "@/lib/domain";
import type { Conversation, Member } from "@/lib/messages";
import { addMembers, loadConversation, removeMember, renameGroup, setRole } from "@/data/messages";
import { useViewer } from "@/data/session";
import { PeoplePicker } from "@/messages/people-picker";
import { Avatar } from "@/ui/avatar";
import { Button, Chip, EmptyState } from "@/ui/controls";
import { Group, SheetHeader, TextField, ToggleRow } from "@/ui/form";
import { BackButton, Header } from "@/ui/header";
import { ActionSheet } from "@/ui/sheet";
import { Text } from "@/ui/text";
import { usePalette } from "@/ui/theme";
import { toast } from "@/ui/toast";

// The website's group settings (src/components/messages/group-settings-dialog.tsx):
// name, people with their roles, whether new people see earlier messages, and Leave.
export default function GroupSettings() {
  const palette = usePalette();
  const viewer = useViewer();
  const conversationId = z.uuid().safeParse(useLocalSearchParams().id).data ?? null;
  const [conversation, setConversation] = useState<Conversation | null | "loading">("loading");
  const [title, setTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const [adding, setAdding] = useState(false);
  const [member, setMember] = useState<Member | null>(null);

  const read = useCallback(() => {
    if (!conversationId) return;
    void loadConversation(conversationId)
      .then((loaded) => {
        setConversation(loaded);
        setTitle(loaded?.title ?? "");
      })
      .catch(() => setConversation(null));
  }, [conversationId]);

  useEffect(read, [read]);

  if (!conversationId) {
    return (
      <View style={{ flex: 1, backgroundColor: palette.surface }}>
        <Header title="Group settings" left={<BackButton />} />
        <EmptyState title="We couldn't find that group" />
      </View>
    );
  }
  if (conversation === "loading" || !viewer) {
    return (
      <View style={{ flex: 1, backgroundColor: palette.surface }}>
        <Header title="Group settings" left={<BackButton />} />
        <ActivityIndicator style={{ marginTop: 40 }} color={palette.inkMuted} accessibilityLabel="Loading" />
      </View>
    );
  }
  if (!conversation || conversation.kind !== "group") {
    return (
      <View style={{ flex: 1, backgroundColor: palette.surface }}>
        <Header title="Group settings" left={<BackButton />} />
        <EmptyState title="We couldn't find that group" />
      </View>
    );
  }

  const manager = conversation.myRole === "owner" || conversation.myRole === "admin";
  const owner = conversation.myRole === "owner";

  async function save() {
    if (!conversation || typeof conversation === "string") return;
    setSaving(true);
    const result = await renameGroup(conversation.id, title);
    setSaving(false);
    if (!result.ok) return Alert.alert("Couldn't rename the group", result.error);
    toast("Group renamed");
    read();
  }

  const leave = () =>
    Alert.alert("Leave this group?", "You won't get its messages any more. Someone in it can add you again.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Leave",
        style: "destructive",
        onPress: () =>
          void removeMember(conversation.id, viewer.id).then((result) => {
            if (!result.ok) return Alert.alert("Couldn't leave", result.error);
            router.dismissTo("/messages");
          }),
      },
    ]);

  const memberActions = (person: Member) => [
    { label: `View ${person.displayName.split(/\s+/)[0]}'s profile`, onPress: () => router.push(`/profile/${person.username}`) },
    ...(owner && person.role !== "owner"
      ? [
          {
            label: person.role === "admin" ? "Remove as admin" : "Make admin",
            onPress: () => void setRole(conversation.id, person.id, person.role === "admin" ? "member" : "admin").then((result) => (result.ok ? read() : Alert.alert("Couldn't change their role", result.error))),
          },
        ]
      : []),
    ...(manager && person.role !== "owner"
      ? [
          {
            label: "Remove from group",
            destructive: true,
            onPress: () => void removeMember(conversation.id, person.id).then((result) => (result.ok ? read() : Alert.alert("Couldn't remove them", result.error))),
          },
        ]
      : []),
  ];

  return (
    <View style={{ flex: 1, backgroundColor: palette.shell }}>
      <Header title="Group settings" left={<BackButton />} />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 22 }}>
        {manager ? (
          <View style={{ gap: 10 }}>
            <TextField label="Group name" value={title} onChangeText={setTitle} maxLength={60} limit={60} placeholder="Leave it blank to use everyone's names" />
            <Button label="Save name" size="medium" variant="outline" busy={saving} disabled={title.trim() === (conversation.title ?? "")} onPress={() => void save()} style={{ alignSelf: "flex-start" }} />
          </View>
        ) : (
          <Text variant="title">{conversation.name}</Text>
        )}
        <Group title={`People · ${conversation.members.length + 1}`}>
          <MemberRow person={{ id: viewer.id, username: viewer.username, displayName: `${viewer.displayName} (you)`, avatarUrl: viewer.avatarUrl, colour: viewer.colour, status: "accepted", role: conversation.myRole, readAt: null }} />
          {conversation.members.map((person) => (
            <MemberRow key={person.id} person={person} onPress={() => setMember(person)} />
          ))}
          {manager ? (
            <Pressable accessibilityRole="button" onPress={() => setAdding(true)} style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 12, minHeight: 56, paddingHorizontal: 16, backgroundColor: pressed ? palette.wash : "transparent" })}>
              <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: palette.primarySoft, alignItems: "center", justifyContent: "center" }}>
                <UserPlus size={18} color={palette.primary} />
              </View>
              <Text variant="body" tone="primary">
                Add people
              </Text>
            </Pressable>
          ) : null}
        </Group>
        <Button label="Leave group" variant="destructive" onPress={leave} />
      </ScrollView>
      <ActionSheet title={member?.displayName} actions={member ? memberActions(member) : []} open={member !== null} onClose={() => setMember(null)} />
      <AddPeople
        open={adding}
        viewerId={viewer.id}
        exclude={conversation.members.map((person) => person.id)}
        onClose={() => setAdding(false)}
        onAdd={async (people, shareHistory) => {
          const result = await addMembers(conversation.id, people.map((person) => person.id), shareHistory);
          if (!result.ok) return Alert.alert("Couldn't add them", result.error);
          setAdding(false);
          toast(people.length === 1 ? "Added to the group" : `Added ${people.length} people`);
          read();
        }}
      />
    </View>
  );
}

function MemberRow({ person, onPress }: { person: Member; onPress?: () => void }) {
  const palette = usePalette();
  return (
    <Pressable
      accessibilityRole={onPress ? "button" : undefined}
      disabled={!onPress}
      onPress={onPress}
      style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 12, minHeight: 60, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: palette.hairline, backgroundColor: pressed ? palette.wash : "transparent" })}
    >
      <Avatar person={person} size={40} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text variant="name" numberOfLines={1}>
          {person.displayName}
        </Text>
        <Text variant="meta" tone="muted" numberOfLines={1}>
          @{person.username}
          {person.status === "pending" ? " · Hasn't accepted yet" : ""}
        </Text>
      </View>
      {person.role === "owner" ? <Chip tone="primary">Owner</Chip> : person.role === "admin" ? <Chip>Admin</Chip> : null}
    </Pressable>
  );
}

function AddPeople({ open, viewerId, exclude, onClose, onAdd }: { open: boolean; viewerId: string; exclude: string[]; onClose: () => void; onAdd: (people: PersonSummary[], shareHistory: boolean) => Promise<void> }) {
  const palette = usePalette();
  const [chosen, setChosen] = useState<PersonSummary[]>([]);
  const [shareHistory, setShareHistory] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <Modal visible={open} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: palette.surface }}>
        <SheetHeader
          title="Add people"
          onCancel={onClose}
          action={{
            label: "Add",
            disabled: chosen.length === 0,
            busy,
            onPress: () => {
              setBusy(true);
              void onAdd(chosen, shareHistory).finally(() => {
                setBusy(false);
                setChosen([]);
              });
            },
          }}
        />
        <View style={{ marginHorizontal: 16, marginBottom: 8, borderRadius: 12, overflow: "hidden", backgroundColor: palette.wash }}>
          <ToggleRow label="Show them earlier messages" hint="Otherwise they see messages from when they join." value={shareHistory} onChange={setShareHistory} last />
        </View>
        <PeoplePicker viewerId={viewerId} chosen={chosen} exclude={exclude} onToggle={(person) => setChosen((current) => (current.some((other) => other.id === person.id) ? current.filter((other) => other.id !== person.id) : [...current, person]))} />
      </View>
    </Modal>
  );
}
