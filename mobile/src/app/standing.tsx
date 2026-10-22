import { router } from "expo-router";
import { Ban } from "lucide-react-native";
import { useState } from "react";
import { ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { calendarDate } from "@/lib/format";
import { CONTACT_EMAIL } from "@/lib/site";
import { siteLink } from "@/data/env";
import { signOut, useSession } from "@/data/session";
import { exportData } from "@/data/settings";
import { Wordmark } from "@/ui/brand";
import { Button } from "@/ui/controls";
import { Header } from "@/ui/header";
import { Text } from "@/ui/text";
import { usePalette } from "@/ui/theme";
import { toast } from "@/ui/toast";
import { openLink } from "@/util/links";
import { timeZone } from "@/util/time";

// A banned or age-deactivated account can read the decision, appeal it and
// delete the account. Nothing else, as on the website's /banned and /deactivated.
export default function StandingScreen() {
  const palette = usePalette();
  const insets = useSafeAreaInsets();
  const session = useSession();
  const [exporting, setExporting] = useState(false);
  if (session.kind !== "signed-in" || session.standing.kind === "active") return null;
  const { standing, viewer } = session;
  const handle = viewer ? `@${viewer.username}` : "your username";
  const banned = standing.kind === "banned";
  const deletesOn = standing.kind === "deactivated" ? calendarDate(standing.deletesAt, timeZone) : null;
  const subject = banned ? `Appeal: ban of ${handle}` : `Age review for ${handle}`;

  return (
    <View style={{ flex: 1, backgroundColor: palette.surface }}>
      <Header>
        <Wordmark />
      </Header>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 16, paddingBottom: insets.bottom + 24, gap: 18 }}>
        <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: palette.destructiveSoft, alignItems: "center", justifyContent: "center" }}>
          <Ban size={26} color={palette.destructive} />
        </View>
        <Text variant="title" accessibilityRole="header">
          {banned ? "Your account is banned" : "Your account is deactivated"}
        </Text>
        {banned ? (
          <Text variant="body">
            Your account is banned from Mavuno for breaking the community rules. You can't post, reply, message, like or follow, and what you posted is hidden.
          </Text>
        ) : (
          <Text variant="body">
            We believe you're under 16, and Australian law doesn't allow people under 16 to have social media accounts. On {deletesOn} your account and everything in it will be deleted, unless a
            review finds you're 16 or older.
          </Text>
        )}
        <View style={{ gap: 6 }}>
          <Text variant="headline" accessibilityRole="header">
            If we got this wrong
          </Text>
          <Text variant="body" tone="muted">
            {banned
              ? `Email ${CONTACT_EMAIL} with your username, ${handle}, and why you think it was a mistake. A different moderator from the one who decided looks at it again, and we aim to reply within 7 days.`
              : `Email ${CONTACT_EMAIL} before ${deletesOn} with your username, ${handle}. A moderator will ask you to show you're 16 or older, in a way you choose. We never require government ID.`}
          </Text>
        </View>
        <Text variant="body" tone="muted">
          You can download everything you shared before deciding what to do. The full notice and how appeals work are on the website.
        </Text>
        <View style={{ gap: 10, paddingTop: 6 }}>
          <Button label="Email us" onPress={() => openLink(`mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}`)} />
          <Button
            label="Download your data"
            variant="outline"
            busy={exporting}
            onPress={() => {
              setExporting(true);
              void exportData().then((result) => {
                setExporting(false);
                if (!result.ok) toast(result.error);
              });
            }}
          />
          <Button label="Read the notice on the website" variant="outline" onPress={() => openLink(siteLink(banned ? "/banned" : "/deactivated"))} />
          <Button label="Sign out" variant="outline" onPress={() => void signOut()} />
          <Button label="Delete my account" variant="plain" onPress={() => router.push("/delete-account")} />
        </View>
      </ScrollView>
    </View>
  );
}
