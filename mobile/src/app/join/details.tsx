import { router } from "expo-router";
import { CircleCheck } from "lucide-react-native";
import { useEffect, useState } from "react";
import { Pressable, View } from "react-native";
import { toUsername, usernameSchema } from "@/lib/schemas";
import { joining, signUp, suggestUsernames } from "@/data/auth";
import { siteLink } from "@/data/env";
import { checkUsername } from "@/data/profiles";
import { JoinFrame } from "@/join/join-frame";
import { Button } from "@/ui/controls";
import { FieldError, PasswordField, TextField } from "@/ui/form";
import { font, Text } from "@/ui/text";
import { usePalette } from "@/ui/theme";
import { openLink } from "@/util/links";

type Check = { kind: "checking" } | { kind: "available" } | { kind: "taken"; suggestions: string[] } | { kind: "invalid"; message: string };

// Join, step 2 of 2: the website's four fields in its order. The username
// follows the name until it's edited, and is checked while typing.
export default function JoinDetails() {
  const palette = usePalette();
  const [name, setName] = useState("");
  const [username, setUsername] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [check, setCheck] = useState<{ name: string; check: Check } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const handle = username ?? toUsername(name);

  // Someone who opened this step without the age question goes back to it.
  useEffect(() => {
    if (!joining.birthDate) router.replace("/join");
  }, []);

  useEffect(() => {
    if (!usernameSchema.safeParse(handle).success) return;
    let live = true;
    const timer = setTimeout(() => {
      void checkUsername(handle).then(async (result) => {
        if (!live) return;
        if (!result.ok) return setCheck({ name: handle, check: { kind: "invalid", message: result.error } });
        if (result.data.available) return setCheck({ name: handle, check: { kind: "available" } });
        const suggestions = await suggestUsernames(handle);
        if (live) setCheck({ name: handle, check: { kind: "taken", suggestions } });
      });
    }, 400);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [handle]);

  const parsed = usernameSchema.safeParse(handle);
  // Too short to judge yet: an error on the first letter only gets in the way.
  const shown: Check | null = handle.length < 3 ? null : !parsed.success ? { kind: "invalid", message: parsed.error.issues[0]?.message ?? "Check the username." } : check?.name === handle ? check.check : { kind: "checking" };

  async function join() {
    setBusy(true);
    setError(null);
    const result = await signUp({ email, password, username: handle, displayName: name });
    setBusy(false);
    if (!result.ok) return setError(result.error);
    // With email confirmation off (local testing), the session arrives and the app moves on.
    if (!result.data.confirmed) router.replace({ pathname: "/join/check-email", params: { email } });
  }

  const legal = (label: string, path: string) => (
    <Text variant="small" tone="primary" accessibilityRole="link" onPress={() => openLink(siteLink(path))}>
      {label}
    </Text>
  );

  return (
    <JoinFrame
      step={2}
      title="Your details"
      footer={
        <>
          <Button label="Join Mavuno" busy={busy} disabled={shown?.kind !== "available" || !name.trim() || !email.trim() || !password} onPress={() => void join()} />
          <Text variant="small" tone="muted" style={{ textAlign: "center" }}>
            By joining you agree to the {legal("community rules", "/rules")}, {legal("terms", "/terms")} and {legal("privacy policy", "/privacy")}.
          </Text>
        </>
      }
    >
      <TextField label="Your name" value={name} onChangeText={setName} maxLength={60} textContentType="name" autoComplete="name" />
      <View style={{ gap: 6 }}>
        <TextField label="Username" value={handle} onChangeText={(text) => setUsername(text.toLowerCase())} autoCapitalize="none" autoCorrect={false} mono maxLength={30} textContentType="none" />
        {shown?.kind === "available" ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <CircleCheck size={16} color={palette.primary} />
            <Text variant="small" tone="primary">
              Available
            </Text>
          </View>
        ) : null}
        {shown?.kind === "invalid" ? <FieldError>{shown.message}</FieldError> : null}
        {shown?.kind === "taken" ? (
          <View style={{ gap: 8 }}>
            <FieldError>That username is taken.</FieldError>
            {shown.suggestions.length > 0 ? (
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {shown.suggestions.map((suggestion) => (
                  <Pressable key={suggestion} accessibilityRole="button" accessibilityLabel={`Use ${suggestion}`} onPress={() => setUsername(suggestion)} style={{ minHeight: 36, paddingHorizontal: 12, borderRadius: 18, justifyContent: "center", backgroundColor: palette.primarySoft }}>
                    <Text variant="meta" tone="primary" style={{ fontFamily: font.monoMedium }}>
                      @{suggestion}
                    </Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
          </View>
        ) : null}
      </View>
      <TextField label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} textContentType="username" autoComplete="email" />
      <PasswordField label="Password" hint="At least 8 characters." value={password} onChangeText={setPassword} textContentType="newPassword" autoComplete="new-password" />
      {error ? <FieldError>{error}</FieldError> : null}
    </JoinFrame>
  );
}
