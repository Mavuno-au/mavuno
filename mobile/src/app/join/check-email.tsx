import { router, useLocalSearchParams } from "expo-router";
import { MailCheck } from "lucide-react-native";
import { Linking, View } from "react-native";
import { JoinFrame } from "@/join/join-frame";
import { Button } from "@/ui/controls";
import { Text } from "@/ui/text";
import { usePalette } from "@/ui/theme";

// The website asks people to confirm their email before signing in. Open
// Mail goes straight to the inbox.
export default function CheckEmail() {
  const palette = usePalette();
  const params = useLocalSearchParams();
  const email = typeof params.email === "string" ? params.email : "";
  return (
    <JoinFrame
      title="Check your email"
      footer={
        <>
          <Button label="Open Mail" onPress={() => void Linking.openURL("message://").catch(() => undefined)} />
          <Button label="I've confirmed it, sign in" variant="outline" onPress={() => router.replace("/sign-in")} />
        </>
      }
    >
      <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: palette.primarySoft, alignItems: "center", justifyContent: "center" }}>
        <MailCheck size={30} color={palette.primary} />
      </View>
      <Text variant="callout">
        We sent a link to {email ? <Text style={{ fontWeight: "600" }}>{email}</Text> : "your email"}. Open it to confirm your address, then sign in here.
      </Text>
      <Text variant="small" tone="muted">
        Can't find it? Check your spam folder. The link works for 24 hours. If someone invited you, you'll already be following each other.
      </Text>
    </JoinFrame>
  );
}
