import { View } from "react-native";
import { JoinFrame } from "@/join/join-frame";
import { Text } from "@/ui/text";
import { openLink } from "@/util/links";

// The website's words and links. Nothing is stored, and the screen points to
// Kids Helpline and eSafety instead of leaving a young person at a dead end.
export default function Under16() {
  return (
    <JoinFrame title="Mavuno is for people 16 and older">
      <Text variant="callout">
        Australian law doesn't allow social media accounts for people under 16, so we can't create one for you. We haven't kept your date of birth. You're welcome to join when you turn 16.
      </Text>
      <View style={{ gap: 12 }}>
        <Text variant="callout" tone="muted">
          Want to talk to someone?{" "}
          <Text variant="callout" tone="primary" accessibilityRole="link" onPress={() => openLink("https://kidshelpline.com.au")}>
            Kids Helpline
          </Text>{" "}
          is free and confidential, any time: 1800 55 1800.
        </Text>
        <Text variant="callout" tone="muted">
          <Text variant="callout" tone="primary" accessibilityRole="link" onPress={() => openLink("https://www.esafety.gov.au/young-people")}>
            eSafety
          </Text>{" "}
          explains the age rules for social media and where to get help online.
        </Text>
      </View>
    </JoinFrame>
  );
}
