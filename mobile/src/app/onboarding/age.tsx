import { useState } from "react";
import { birthDateSchema } from "@/lib/age";
import { confirmAge, rememberUnder16 } from "@/data/auth";
import { siteLink } from "@/data/env";
import { reloadViewer, signOut } from "@/data/session";
import { BirthDateFields, type BirthDate } from "@/join/birth-date-fields";
import { JoinFrame } from "@/join/join-frame";
import { Wordmark } from "@/ui/brand";
import { Button } from "@/ui/controls";
import { FieldError } from "@/ui/form";
import { Text } from "@/ui/text";
import { openLink } from "@/util/links";

// The website's /onboarding/age: members who joined before the age check
// answer once. Under 16, the database deactivates the account and the app
// moves to the standing screen.
export default function ConfirmAge() {
  const [date, setDate] = useState<BirthDate>({ day: "", month: "", year: "" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    const parsed = birthDateSchema.safeParse(date);
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? "Check your date of birth.");
    setError(null);
    setBusy(true);
    const result = await confirmAge(parsed.data);
    setBusy(false);
    if (!result.ok) return setError(result.error);
    if (!result.data) await rememberUnder16();
    reloadViewer();
  }

  return (
    <JoinFrame
      top={
        <>
          <Wordmark />
          <Button label="Sign out" variant="plain" size="medium" onPress={() => void signOut()} />
        </>
      }
      title="Confirm your age"
      intro="Australian law requires social media services to check that members are 16 or older, so we're asking everyone, including people who joined before. You only need to do this once."
      footer={<Button label="Continue" busy={busy} onPress={() => void submit()} />}
    >
      <BirthDateFields value={date} onChange={setDate} invalid={error !== null} />
      {error ? <FieldError>{error}</FieldError> : null}
      <Text variant="small" tone="muted">
        We keep only a note that you confirmed your age, and when. Read more in the{" "}
        <Text variant="small" tone="primary" accessibilityRole="link" onPress={() => openLink(siteLink("/privacy"))}>
          privacy policy
        </Text>
        .
      </Text>
    </JoinFrame>
  );
}
