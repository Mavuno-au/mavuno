import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator } from "react-native";
import { z } from "zod";
import { emailLinkInHand, verifyEmailLink, type LinkAnswer } from "@/data/auth";
import { PROBLEM } from "@/data/errors";
import { signOut, useSession } from "@/data/session";
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
  const session = useSession();
  const signedIn = session.kind === "signed-in";
  const [answer, setAnswer] = useState<LinkAnswer | null>(link === null ? { kind: "spent" } : null);
  const [attempt, setAttempt] = useState(0);
  const tokenHash = link?.token_hash ?? null;
  const type = link?.type ?? null;
  // Someone may send a member a link to their own account, so a member who is
  // signed in isn't switched to it without asking. A link this launch is
  // already verifying is the one that signed them in.
  const elsewhere = signedIn && tokenHash !== null && !emailLinkInHand(tokenHash);

  useEffect(() => {
    if (!tokenHash || !type || elsewhere) return;
    let current = true;
    void verifyEmailLink(tokenHash, type).then((result) => current && setAnswer(result));
    return () => {
      current = false;
    };
  }, [tokenHash, type, elsewhere, attempt]);

  // The session reaches the app a moment after the link is verified.
  useEffect(() => {
    if (answer?.kind === "verified" && signedIn) router.replace("/");
  }, [answer, signedIn]);

  if (elsewhere) {
    const username = session.viewer?.username;
    return (
      <JoinFrame
        top={<></>}
        title="You're already signed in"
        footer={
          <>
            <Button label="Open Mavuno" onPress={() => router.replace("/")} />
            <Button label="Sign out and use the link" variant="outline" onPress={() => void signOut()} />
          </>
        }
      >
        <Text variant="callout">{username ? `You're signed in as @${username}, so this link hasn't been used.` : "This link hasn't been used, because you're signed in."} To sign in with it instead, sign out first.</Text>
      </JoinFrame>
    );
  }
  if (answer === null || answer.kind === "verified") {
    return (
      <JoinFrame top={<></>} title="Signing you in">
        <ActivityIndicator color={palette.inkMuted} accessibilityLabel="Signing you in" />
      </JoinFrame>
    );
  }
  if (answer.kind === "unreachable") {
    return (
      <JoinFrame
        title="Couldn't check this link"
        footer={
          <Button
            label="Try again"
            onPress={() => {
              setAnswer(null);
              setAttempt((count) => count + 1);
            }}
          />
        }
      >
        <Text variant="callout">
          {PROBLEM[answer.reason]}
          {answer.reason === "offline" ? " The link hasn't been used, so it still works." : ""}
        </Text>
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
