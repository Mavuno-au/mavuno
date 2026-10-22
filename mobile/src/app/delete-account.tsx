import { CircleAlert } from "lucide-react-native";
import { useState } from "react";
import { AccessibilityInfo, Keyboard, KeyboardAvoidingView, ScrollView, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { deleteAccount } from "@/data/account";
import { useSession } from "@/data/session";
import { exportData } from "@/data/settings";
import { Button } from "@/ui/controls";
import { BackButton, Header } from "@/ui/header";
import { font, Text, type } from "@/ui/text";
import { usePalette } from "@/ui/theme";
import { toast } from "@/ui/toast";

// The website's Settings › Account › Delete, in the app because the App
// Store requires it there. Typing the username is the confirmation.
export default function DeleteAccount() {
  const palette = usePalette();
  const insets = useSafeAreaInsets();
  const session = useSession();
  const viewer = session.kind === "signed-in" ? session.viewer : null;
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function fail(message: string) {
    setError(message);
    AccessibilityInfo.announceForAccessibility(message);
  }

  async function submit() {
    if (busy || session.kind !== "signed-in") return;
    if (!viewer) return fail("Your profile hasn't loaded yet. Try again in a moment.");
    if (confirm.trim().replace(/^@/, "").toLowerCase() !== viewer.username) return fail(`Type ${viewer.username} to confirm.`);
    Keyboard.dismiss();
    setError(null);
    setBusy(true);
    const result = await deleteAccount(session.session.user.id);
    // Success needs nothing here: the session ends and the app moves to Welcome.
    if (!result.ok) {
      setBusy(false);
      fail(result.error);
    }
  }

  return (
    <KeyboardAvoidingView behavior="padding" style={{ flex: 1, backgroundColor: palette.surface }}>
      <Header title="Delete account" left={<BackButton fallback="/settings" />} />
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 24, paddingTop: 12, paddingBottom: insets.bottom + 16, gap: 20 }}>
        <View style={{ gap: 10 }}>
          <Text variant="body">
            Your profile, posts, replies, likes, follows, messages you sent and the images you uploaded are deleted for good. Replies other people wrote under your posts stay, under a [deleted]
            placeholder.
          </Text>
          <Text variant="body">Organisations you own on your own are deleted too. Hand them over first if they should carry on.</Text>
          <Text variant="body" tone="muted">
            To keep a copy first,{" "}
            <Text
              variant="body"
              tone="primary"
              accessibilityRole="button"
              onPress={() =>
                void exportData().then((result) => {
                  if (!result.ok) toast(result.error);
                })
              }
            >
              download your data
            </Text>
            .
          </Text>
        </View>

        <View style={{ gap: 6 }}>
          <Text variant="label" importantForAccessibility="no" accessibilityElementsHidden>
            Type {viewer ? viewer.username : "your username"} to confirm
          </Text>
          <TextInput
            accessibilityLabel={`Type ${viewer ? viewer.username : "your username"} to confirm`}
            aria-invalid={error !== null}
            value={confirm}
            onChangeText={(value) => {
              setConfirm(value);
              setError(null);
            }}
            editable={!busy}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="off"
            returnKeyType="done"
            onSubmitEditing={() => void submit()}
            style={[type.body, { fontFamily: font.mono, fontSize: 17, lineHeight: undefined, minHeight: 50, borderRadius: 12, borderWidth: error ? 2 : 1, borderColor: error ? palette.destructive : palette.rail, paddingHorizontal: 14, paddingVertical: 12, color: palette.ink }]}
          />
          {error ? (
            <View style={{ flexDirection: "row", gap: 6, alignItems: "flex-start" }}>
              <CircleAlert size={16} color={palette.destructive} style={{ marginTop: 2 }} />
              <Text variant="subhead" tone="destructive" style={{ flex: 1 }}>
                {error}
              </Text>
            </View>
          ) : null}
        </View>

        <View style={{ flex: 1 }} />
        <Button
          label={busy ? "Deleting…" : "Delete my account"}
          variant="destructive"
          busy={busy}
          disabled={!viewer || confirm.trim().replace(/^@/, "").toLowerCase() !== viewer.username}
          onPress={() => void submit()}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
