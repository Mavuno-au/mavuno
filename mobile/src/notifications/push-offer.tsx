import { BellRing } from "lucide-react-native";
import { View } from "react-native";
import { askForPush, declinePush, usePushOffer } from "@/data/push";
import { useViewer } from "@/data/session";
import { Button } from "@/ui/controls";
import { Text } from "@/ui/text";
import { HAIRLINE, usePalette } from "@/ui/theme";

// Asks before iOS does, on the tabs where notifications would have helped, so
// the system prompt comes when the member can see why.
export function PushOffer() {
  const palette = usePalette();
  const viewerId = useViewer()?.id ?? null;
  const offer = usePushOffer(viewerId);
  if (!offer || !viewerId) return null;
  return (
    <View style={{ flexDirection: "row", gap: 12, padding: 16, backgroundColor: palette.wash, borderBottomWidth: HAIRLINE, borderBottomColor: palette.hairline }}>
      <BellRing size={22} color={palette.primary} style={{ marginTop: 2 }} />
      <View style={{ flex: 1, gap: 10 }}>
        <View style={{ gap: 2 }}>
          <Text variant="headline">Turn on notifications?</Text>
          <Text variant="small" tone="muted">
            Find out when someone replies to you or sends you a message.
          </Text>
        </View>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          <Button label="Turn on" size="medium" onPress={() => void askForPush()} />
          <Button label="Not now" size="medium" variant="plain" onPress={() => declinePush(viewerId)} />
        </View>
      </View>
    </View>
  );
}
