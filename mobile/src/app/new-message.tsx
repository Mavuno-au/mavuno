import { router } from "expo-router";
import { useState } from "react";
import { Alert, View } from "react-native";
import type { PersonSummary } from "@/lib/domain";
import { createGroup, startConversation } from "@/data/messages";
import { useViewer } from "@/data/session";
import { PeoplePicker } from "@/messages/people-picker";
import { SheetHeader, TextField } from "@/ui/form";
import { Text } from "@/ui/text";
import { usePalette } from "@/ui/theme";

// The website's new conversation: one person for a private chat, a few for a
// group. People who don't follow you get the first message as a request.
export default function NewMessage() {
  const palette = usePalette();
  const viewer = useViewer();
  const [chosen, setChosen] = useState<PersonSummary[]>([]);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  if (!viewer) return null;
  const group = chosen.length > 1;

  async function start() {
    setBusy(true);
    const [only] = chosen;
    const result = group ? await createGroup(title, chosen.map((person) => person.id)) : only ? await startConversation(only.id) : null;
    setBusy(false);
    if (!result) return;
    if (!result.ok) return Alert.alert("Couldn't start the conversation", result.error);
    router.back();
    router.push(`/conversation/${result.data.id}`);
  }

  return (
    <View style={{ flex: 1, backgroundColor: palette.surface }}>
      <SheetHeader title={group ? "New group" : "New message"} onCancel={() => router.back()} action={{ label: group ? "Create" : "Chat", onPress: () => void start(), disabled: chosen.length === 0, busy }} />
      {group ? (
        <View style={{ paddingHorizontal: 16, paddingBottom: 10, gap: 6 }}>
          <TextField label="Group name (optional)" value={title} onChangeText={setTitle} maxLength={60} limit={60} placeholder="Leave it blank to use everyone's names" />
        </View>
      ) : (
        <Text variant="small" tone="muted" style={{ paddingHorizontal: 16, paddingBottom: 8 }}>
          Choose one person for a private chat, or a few for a group.
        </Text>
      )}
      <PeoplePicker
        viewerId={viewer.id}
        chosen={chosen}
        onToggle={(person) => setChosen((current) => (current.some((other) => other.id === person.id) ? current.filter((other) => other.id !== person.id) : [...current, person].slice(0, 99)))}
      />
    </View>
  );
}
