import { router } from "expo-router";
import { ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { siteLink } from "@/data/env";
import { BrandMark } from "@/ui/brand";
import { Button } from "@/ui/controls";
import { font, Text } from "@/ui/text";
import { usePalette } from "@/ui/theme";
import { openLink } from "@/util/links";

export default function Welcome() {
  const palette = usePalette();
  const insets = useSafeAreaInsets();
  const legal = (label: string, path: string) => (
    <Text variant="small" tone="primary" accessibilityRole="link" onPress={() => openLink(siteLink(path))}>
      {label}
    </Text>
  );

  return (
    <ScrollView
      style={{ backgroundColor: palette.surface }}
      contentContainerStyle={{ flexGrow: 1, justifyContent: "space-between", paddingTop: insets.top + 90, paddingBottom: insets.bottom + 24, paddingHorizontal: 24, gap: 40 }}
    >
      <View style={{ gap: 22, paddingHorizontal: 4 }}>
        <BrandMark height={56} />
        <View style={{ gap: 14 }}>
          <Text variant="largeTitle" accessibilityRole="header">
            The social network for African Australians
          </Text>
          <Text variant="headline" tone="muted" style={{ fontFamily: font.regular, lineHeight: 25 }}>
            Follow people and organisations, join your city's space, and find events, jobs, scholarships and mentors from the community.
          </Text>
        </View>
        <Text variant="callout" tone="muted">
          <Text variant="callout" style={{ fontFamily: font.semibold }}>
            Mavuno
          </Text>{" "}
          is Swahili for harvest.
        </Text>
      </View>

      <View style={{ gap: 12 }}>
        {/* Joining happens on the website for now; the account then signs in here. */}
        <Button label="Join Mavuno" onPress={() => openLink(siteLink("/signup"))} />
        <Button label="Sign in" variant="outline" onPress={() => router.push("/sign-in")} />
        <Text variant="small" tone="muted" style={{ textAlign: "center", marginTop: 6, marginHorizontal: 8 }}>
          Free to join. By joining you agree to the {legal("community rules", "/rules")}, {legal("terms", "/terms")} and {legal("privacy policy", "/privacy")}.
        </Text>
      </View>
    </ScrollView>
  );
}
