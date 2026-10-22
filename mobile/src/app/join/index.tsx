import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { birthDateSchema } from "@/lib/age";
import type { ProfileCard } from "@/lib/domain";
import { joining, loadInviter, meetsMinimumAge, rememberUnder16, saidUnder16Recently } from "@/data/auth";
import { BirthDateFields, type BirthDate } from "@/join/birth-date-fields";
import { JoinFrame } from "@/join/join-frame";
import { Button } from "@/ui/controls";
import { FieldError } from "@/ui/form";
import { Text } from "@/ui/text";

// Join, step 1 of 2: the age question comes before anything else, as on the
// website, and only the answer is kept with the account.
export default function JoinAge() {
  const params = useLocalSearchParams();
  const invite = typeof params.invite === "string" ? params.invite : null;
  const [date, setDate] = useState<BirthDate>({ day: "", month: "", year: "" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [inviter, setInviter] = useState<ProfileCard | null>(null);

  useEffect(() => {
    // A young person who already answered sees the same screen for a day.
    void saidUnder16Recently().then((recent) => {
      if (recent) router.replace("/join/under-16");
    });
  }, []);

  useEffect(() => {
    if (!invite) return;
    void loadInviter(invite).then(setInviter);
  }, [invite]);

  async function next() {
    const parsed = birthDateSchema.safeParse(date);
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? "Check your date of birth.");
    setError(null);
    setBusy(true);
    const oldEnough = await meetsMinimumAge(parsed.data);
    setBusy(false);
    if (oldEnough === null) return setError("We couldn't check your details. Try again.");
    if (!oldEnough) {
      await rememberUnder16();
      return router.replace("/join/under-16");
    }
    joining.start(parsed.data, inviter?.username ?? null);
    router.push("/join/details");
  }

  return (
    <JoinFrame step={1} title="When were you born?" intro="Mavuno is for people 16 and older. We check your age and don't keep the date." inviter={inviter} footer={<Button label="Continue" busy={busy} onPress={() => void next()} />}>
      <BirthDateFields value={date} onChange={setDate} invalid={error !== null} />
      {error ? <FieldError>{error}</FieldError> : null}
      <Text variant="small" tone="muted">
        Australian law requires social media to check that members are 16 or over.
      </Text>
    </JoinFrame>
  );
}
