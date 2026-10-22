import { CircleAlert, Eye, EyeOff } from "lucide-react-native";
import { useRef, useState, type ComponentRef, type ReactNode, type Ref } from "react";
import { AccessibilityInfo, Keyboard, KeyboardAvoidingView, Pressable, ScrollView, TextInput, View, type TextInputProps } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { signInError, signInSchema } from "@/lib/schemas";
import { router } from "expo-router";
import { sendMagicLink } from "@/data/auth";
import { supabase } from "@/data/supabase";
import { Button } from "@/ui/controls";
import { BackButton } from "@/ui/header";
import { font, Text, type } from "@/ui/text";
import { usePalette } from "@/ui/theme";
import { toast } from "@/ui/toast";

type Problem = { field: "email" | "password"; message: string } | null;

export default function SignIn() {
  const palette = usePalette();
  const insets = useSafeAreaInsets();
  const passwordRef = useRef<ComponentRef<typeof TextInput>>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [shown, setShown] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<Problem>(null);

  function fail(next: NonNullable<Problem>) {
    setProblem(next);
    AccessibilityInfo.announceForAccessibility(next.message);
  }

  async function submit() {
    if (busy) return;
    const parsed = signInSchema.safeParse({ email, password });
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      return fail({ field: issue?.path[0] === "password" ? "password" : "email", message: issue?.message ?? "Check the form and try again." });
    }
    Keyboard.dismiss();
    setProblem(null);
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword(parsed.data);
    setBusy(false);
    // Success needs nothing here: the session changes and the app moves to Home.
    if (!error) return;
    // A request that never reached the server has no status.
    if (!error.status) fail({ field: "password", message: "Couldn't reach Mavuno. Check your connection and try again." });
    else fail({ field: "password", message: signInError(error.code) });
  }

  // A link to sign in without a password, sent to the address typed above.
  async function emailLink() {
    const parsed = signInSchema.shape.email.safeParse(email);
    if (!parsed.success) return fail({ field: "email", message: parsed.error.issues[0]?.message ?? "Enter your email address." });
    setBusy(true);
    const result = await sendMagicLink(parsed.data);
    setBusy(false);
    if (!result.ok) return fail({ field: "email", message: result.error });
    setProblem(null);
    toast("If that email has an account, a sign-in link is on its way.", { duration: 6000 });
  }

  return (
    <KeyboardAvoidingView behavior="padding" style={{ flex: 1, backgroundColor: palette.surface }}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ flexGrow: 1, paddingTop: insets.top, paddingBottom: insets.bottom + 16 }}>
        <View style={{ minHeight: 52, paddingHorizontal: 16, justifyContent: "center", alignItems: "flex-start" }}>
          <BackButton fallback="/welcome" />
        </View>
        <View style={{ flex: 1, paddingHorizontal: 24, paddingTop: 4, gap: 22 }}>
          <View style={{ gap: 6 }}>
            <Text variant="largeTitle" accessibilityRole="header">
              Welcome back
            </Text>
            <Text variant="headline" tone="muted" style={{ fontFamily: font.regular, lineHeight: 24 }}>
              Sign in to post, follow and message.
            </Text>
          </View>

          <Field
            label="Email"
            error={problem?.field === "email" ? problem.message : null}
            editable={!busy}
            value={email}
            onChangeText={(value) => {
              setEmail(value);
              if (problem?.field === "email") setProblem(null);
            }}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="email"
            textContentType="username"
            returnKeyType="next"
            submitBehavior="submit"
            onSubmitEditing={() => passwordRef.current?.focus()}
          />

          <View style={{ gap: 6 }}>
            <Field
              ref={passwordRef}
              label="Password"
              error={problem?.field === "password" ? problem.message : null}
              editable={!busy}
              value={password}
              onChangeText={(value) => {
                setPassword(value);
                if (problem?.field === "password") setProblem(null);
              }}
              secureTextEntry={!shown}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="current-password"
              textContentType="password"
              returnKeyType="go"
              onSubmitEditing={() => void submit()}
              trailing={
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={shown ? "Hide password" : "Show password"}
                  onPress={() => setShown((value) => !value)}
                  style={{ width: 44, alignSelf: "stretch", alignItems: "center", justifyContent: "center" }}
                >
                  {shown ? <EyeOff size={20} color={palette.inkMuted} /> : <Eye size={20} color={palette.inkMuted} />}
                </Pressable>
              }
            />
            <Pressable accessibilityRole="link" onPress={() => router.push({ pathname: "/forgot-password", params: { email } })} hitSlop={6} style={{ alignSelf: "flex-start", minHeight: 36, justifyContent: "center" }}>
              <Text variant="callout" tone="primary" style={{ fontFamily: font.medium }}>
                Forgot your password?
              </Text>
            </Pressable>
          </View>
        </View>

        <View style={{ paddingHorizontal: 24, paddingTop: 24, gap: 10 }}>
          <Button label={busy ? "Signing in…" : "Sign in"} busy={busy} onPress={() => void submit()} />
          <Button label="Email me a sign-in link instead" variant="plain" disabled={busy} onPress={() => void emailLink()} />
          <Text variant="callout" tone="muted" style={{ textAlign: "center" }}>
            New here?{" "}
            <Text variant="callout" tone="primary" accessibilityRole="link" style={{ fontFamily: font.semibold }} onPress={() => router.replace("/join")}>
              Create an account
            </Text>
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// A labelled input, at least 16 points so iOS doesn't zoom, with its error
// under it. The visible label is the input's spoken name, so VoiceOver reads it once.
function Field({ label, error, trailing, ref, ...input }: TextInputProps & { label: string; error: string | null; trailing?: ReactNode; ref?: Ref<ComponentRef<typeof TextInput>> }) {
  const palette = usePalette();
  const invalid = error !== null;
  return (
    <View style={{ gap: 6 }}>
      <Text variant="label" importantForAccessibility="no" accessibilityElementsHidden>
        {label}
      </Text>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          minHeight: 50,
          borderRadius: 12,
          borderWidth: invalid ? 2 : 1,
          borderColor: invalid ? palette.destructive : palette.rail,
          backgroundColor: palette.surface,
          paddingRight: trailing ? 3 : 0,
        }}
      >
        <TextInput
          {...input}
          ref={ref}
          accessibilityLabel={label}
          aria-invalid={invalid}
          placeholderTextColor={palette.inkMuted}
          style={[type.body, { flex: 1, fontSize: 17, lineHeight: undefined, paddingHorizontal: 14, paddingVertical: 12, color: palette.ink }]}
        />
        {trailing}
      </View>
      {error ? (
        <View style={{ flexDirection: "row", gap: 6, alignItems: "flex-start" }}>
          <CircleAlert size={16} color={palette.destructive} style={{ marginTop: 2 }} />
          <Text variant="subhead" tone="destructive" style={{ flex: 1 }}>
            {error}
          </Text>
        </View>
      ) : null}
    </View>
  );
}
