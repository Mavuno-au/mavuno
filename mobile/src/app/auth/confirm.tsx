import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator } from "react-native";
import { z } from "zod";
import { verifyEmailLink } from "@/data/auth";
import { useSession } from "@/data/session";
import { JoinFrame } from "@/join/join-frame";
import { Button } from "@/ui/controls";
import { Text } from "@/ui/text";
import { usePalette } from "@/ui/theme";

const linkSchema = z.object({ token_hash: z.string().min(1), type: z.enum(["signup", "magiclink", "email", "invite"]) });

// mavuno.au/auth/confirm, opened in the app from a sign-up or sign-in email.
// Once the link is verified the session arrives and the app's gates take
// the member on, to onboarding or Home.
export default function ConfirmLink() {
  const palette = usePalette();
  const link = linkSchema.safeParse(useLocalSearchParams()).data ?? null;
  const signedIn = useSession().kind === "signed-in";
  const [state, setState] = useState<"checking" | "verified" | "failed">(link === null ? "failed" : "checking");
  const tokenHash = link?.token_hash ?? null;
  const type = link?.type ?? null;

  useEffect(() => {
    if (!tokenHash || !type) return;
    void verifyEmailLink(tokenHash, type).then((result) => setState(result.ok ? "verified" : "failed"));
  }, [tokenHash, type]);

  // The session reaches the app a moment after the link is verified.
  useEffect(() => {
    if (state === "verified" && signedIn) router.replace("/");
  }, [state, signedIn]);

  if (state !== "failed") {
    return (
      <JoinFrame top={<></>} title="Signing you in">
        <ActivityIndicator color={palette.inkMuted} />
      </JoinFrame>
    );
  }
  return (
    <JoinFrame title="This link doesn't work any more" footer={signedIn ? <Button label="Open Mavuno" onPress={() => router.replace("/")} /> : <Button label="Sign in" onPress={() => router.replace("/sign-in")} />}>
      <Text variant="callout">
        {signedIn ? "Email links work once, for 24 hours. You're already signed in, so there's nothing more to do." : "Email links work once, for 24 hours. Sign in with your password, or ask for a new link from the sign-in screen."}
      </Text>
    </JoinFrame>
  );
}
