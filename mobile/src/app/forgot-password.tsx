import { useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { requestPasswordReset } from "@/data/auth";
import { JoinFrame } from "@/join/join-frame";
import { Button } from "@/ui/controls";
import { FieldError, TextField } from "@/ui/form";
import { Text } from "@/ui/text";

// Always the same answer, whether or not the email has an account, so
// nobody can check who is on Mavuno. The link resets the password on the website.
export default function ForgotPassword() {
  const params = useLocalSearchParams();
  const initial = typeof params.email === "string" ? params.email : "";
  const [email, setEmail] = useState(initial);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    setBusy(true);
    setError(null);
    const result = await requestPasswordReset(email);
    setBusy(false);
    if (!result.ok) return setError(result.error);
    setSent(true);
  }

  if (sent) {
    return (
      <JoinFrame title="Check your email">
        <Text variant="callout">If that email has an account, a reset link is on its way. Open it to choose a new password.</Text>
      </JoinFrame>
    );
  }
  return (
    <JoinFrame title="Reset your password" intro="We'll email you a link to choose a new one." footer={<Button label="Send link" busy={busy} disabled={!email.trim()} onPress={() => void send()} />}>
      <TextField label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} textContentType="emailAddress" />
      {error ? <FieldError>{error}</FieldError> : null}
    </JoinFrame>
  );
}
