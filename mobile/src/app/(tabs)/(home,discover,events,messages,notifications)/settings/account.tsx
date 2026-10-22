import { router } from "expo-router";
import { CircleCheck } from "lucide-react-native";
import { useEffect, useState } from "react";
import { Alert, KeyboardAvoidingView, Platform, ScrollView, View } from "react-native";
import { usernameSchema } from "@/lib/schemas";
import { checkUsername, updateProfile } from "@/data/profiles";
import { reloadViewer, useSession, useViewer } from "@/data/session";
import { changeEmail, changePassword, exportData } from "@/data/settings";
import { Button } from "@/ui/controls";
import { FieldError, Group, PasswordField, Row, TextField } from "@/ui/form";
import { BackButton, Header } from "@/ui/header";
import { Text } from "@/ui/text";
import { usePalette } from "@/ui/theme";
import { toast } from "@/ui/toast";

type Check = { kind: "idle" } | { kind: "checking" } | { kind: "available" } | { kind: "taken" } | { kind: "invalid"; message: string };

// Username, email and password; Download your data; and Delete my account,
// in red on its own, as on the website.
export default function AccountSettings() {
  const palette = usePalette();
  const viewer = useViewer();
  const session = useSession();
  const email = session.kind === "signed-in" ? (session.session.user.email ?? "") : "";
  const [username, setUsername] = useState(viewer?.username ?? "");
  // Each answer is kept with the name it was for, so an old answer never shows for a new name.
  const [check, setCheck] = useState<{ name: string; check: Check } | null>(null);
  const [newEmail, setNewEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState<"username" | "email" | "password" | "export" | null>(null);
  const [errors, setErrors] = useState<Partial<Record<"username" | "email" | "password", string>>>({});
  const current = viewer?.username ?? "";
  const wanted = username.trim().toLowerCase();

  // Checked while typing, with a tick and Available.
  useEffect(() => {
    if (!wanted || wanted === current) return;
    const parsed = usernameSchema.safeParse(wanted);
    if (!parsed.success) return;
    let live = true;
    const timer = setTimeout(() => {
      void checkUsername(wanted).then((result) => {
        if (!live) return;
        setCheck({ name: wanted, check: result.ok ? { kind: result.data.available ? "available" : "taken" } : { kind: "invalid", message: result.error } });
      });
    }, 400);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [wanted, current]);

  if (!viewer) return null;
  const parsed = usernameSchema.safeParse(wanted);
  const shownCheck: Check =
    !wanted || wanted === current
      ? { kind: "idle" }
      : !parsed.success
        ? { kind: "invalid", message: parsed.error.issues[0]?.message ?? "Check the username." }
        : check?.name === wanted
          ? check.check
          : { kind: "checking" };

  async function saveUsername() {
    if (!viewer) return;
    setBusy("username");
    const result = await updateProfile(viewer.id, { username: wanted });
    setBusy(null);
    if (!result.ok) return setErrors((current) => ({ ...current, username: result.error }));
    setErrors((current) => ({ ...current, username: undefined }));
    reloadViewer();
    toast("Username changed");
  }

  async function saveEmail() {
    if (!viewer) return;
    setBusy("email");
    const result = await changeEmail(newEmail, viewer.suspended);
    setBusy(null);
    if (!result.ok) return setErrors((current) => ({ ...current, email: result.error }));
    setErrors((current) => ({ ...current, email: undefined }));
    setNewEmail("");
    Alert.alert("Check both inboxes", "We sent a link to your old and new addresses. Your email changes once you've opened both.");
  }

  async function savePassword() {
    setBusy("password");
    const result = await changePassword(password, confirm);
    setBusy(null);
    if (!result.ok) return setErrors((current) => ({ ...current, password: result.error }));
    setErrors((current) => ({ ...current, password: undefined }));
    setPassword("");
    setConfirm("");
    toast("Password changed");
  }

  async function download() {
    setBusy("export");
    const result = await exportData();
    setBusy(null);
    if (!result.ok) Alert.alert("Couldn't download your data", result.error);
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1, backgroundColor: palette.shell }}>
      <Header title="Account" left={<BackButton fallback="/settings" />} />
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 16, gap: 26, paddingBottom: 48 }}>
        <View style={{ gap: 10 }}>
          <TextField label="Username" value={username} onChangeText={setUsername} autoCapitalize="none" autoCorrect={false} mono maxLength={30} error={errors.username} />
          {shownCheck.kind === "available" ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <CircleCheck size={16} color={palette.primary} />
              <Text variant="small" tone="primary">
                Available
              </Text>
            </View>
          ) : null}
          {shownCheck.kind === "taken" ? <FieldError>That username is taken.</FieldError> : null}
          {shownCheck.kind === "invalid" ? <FieldError>{shownCheck.message}</FieldError> : null}
          <Text variant="small" tone="muted">
            Your profile moves to mavuno.au/@{wanted || current}. Old links stop working.
          </Text>
          <Button label="Change username" variant="outline" size="medium" busy={busy === "username"} disabled={shownCheck.kind !== "available"} onPress={() => void saveUsername()} style={{ alignSelf: "flex-start" }} />
        </View>

        <View style={{ gap: 10 }}>
          <Text variant="label">Email</Text>
          <Text variant="callout" tone="muted" selectable>
            {email}
          </Text>
          <TextField label="New email" value={newEmail} onChangeText={setNewEmail} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} textContentType="emailAddress" error={errors.email} />
          <Button label="Change email" variant="outline" size="medium" busy={busy === "email"} disabled={!newEmail.trim()} onPress={() => void saveEmail()} style={{ alignSelf: "flex-start" }} />
        </View>

        <View style={{ gap: 10 }}>
          <PasswordField label="New password" value={password} onChangeText={setPassword} textContentType="newPassword" />
          <PasswordField label="Type it again" value={confirm} onChangeText={setConfirm} textContentType="newPassword" error={errors.password} />
          <Button label="Change password" variant="outline" size="medium" busy={busy === "password"} disabled={!password || !confirm} onPress={() => void savePassword()} style={{ alignSelf: "flex-start" }} />
        </View>

        <Group title="Your data" footer="A copy of everything Mavuno holds about you, as a JSON file. Three times an hour.">
          <Row label="Download your data" busy={busy === "export"} onPress={() => void download()} last />
        </Group>
        <Group footer="Your profile, posts and the messages you sent are deleted. This can't be undone.">
          <Row label="Delete my account" tone="destructive" onPress={() => router.push("/delete-account")} last />
        </Group>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
