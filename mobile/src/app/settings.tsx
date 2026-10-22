import Constants from "expo-constants";
import { router } from "expo-router";
import { ChevronRight, ExternalLink, FileText, LifeBuoy, LogOut, Mail, Scale, Shield, Trash, UserX } from "lucide-react-native";
import type { ReactNode } from "react";
import { Alert, Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CONTACT_EMAIL } from "@/lib/site";
import { siteLink } from "@/data/env";
import { signOut, useViewer } from "@/data/session";
import { BackButton, Header } from "@/ui/header";
import { font, Text } from "@/ui/text";
import { usePalette } from "@/ui/theme";
import { openLink } from "@/util/links";

// What the App Store expects to find in the app itself: a way to reach us,
// the rules, sign out and account deletion. Everything else is edited on the
// website for now.
export default function Settings() {
  const palette = usePalette();
  const insets = useSafeAreaInsets();
  const viewer = useViewer();
  const icon = (Icon: typeof Mail) => <Icon size={20} color={palette.inkMuted} />;
  const web = (path: string) => () => openLink(siteLink(path));

  function confirmSignOut() {
    Alert.alert("Sign out of Mavuno?", undefined, [
      { text: "Cancel", style: "cancel" },
      { text: "Sign out", style: "destructive", onPress: () => void signOut() },
    ]);
  }

  return (
    <View style={{ flex: 1, backgroundColor: palette.surface }}>
      <Header title="Settings" left={<BackButton />} />
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}>
        <Section title="Your account">
          <Row icon={icon(ExternalLink)} label="Edit your profile and settings" hint="On the website" onPress={web("/settings")} />
          <Row icon={icon(UserX)} label="Muted and blocked accounts" hint="On the website" onPress={web("/settings/safety")} />
        </Section>
        <Section title="Help">
          <Row icon={icon(LifeBuoy)} label="Help centre" onPress={web("/help")} />
          <Row icon={icon(Mail)} label="Contact us" hint={CONTACT_EMAIL} onPress={() => openLink(`mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent("Mavuno app")}`)} />
          <Row icon={icon(Shield)} label="Community rules" onPress={web("/rules")} />
          <Row icon={icon(FileText)} label="Privacy policy" onPress={web("/privacy")} />
          <Row icon={icon(Scale)} label="Terms" onPress={web("/terms")} />
        </Section>
        <Section title={viewer ? `Signed in as @${viewer.username}` : "Signed in"}>
          <Row icon={icon(LogOut)} label="Sign out" onPress={confirmSignOut} />
          <Row icon={<Trash size={20} color={palette.destructive} />} label="Delete account" tone="destructive" onPress={() => router.push("/delete-account")} />
        </Section>
        <Text variant="caption" tone="muted" style={{ textAlign: "center", paddingTop: 16 }}>
          Mavuno {Constants.expoConfig?.version ?? ""}
        </Text>
      </ScrollView>
    </View>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  const palette = usePalette();
  return (
    <View style={{ paddingTop: 18 }}>
      <Text variant="small" tone="muted" accessibilityRole="header" style={{ fontFamily: font.semibold, paddingHorizontal: 16, paddingBottom: 6 }}>
        {title}
      </Text>
      <View style={{ borderTopWidth: 1, borderBottomWidth: 1, borderColor: palette.hairline }}>{children}</View>
    </View>
  );
}

function Row({ icon, label, hint, tone = "ink", onPress }: { icon: ReactNode; label: string; hint?: string; tone?: "ink" | "destructive"; onPress: () => void }) {
  const palette = usePalette();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={hint ? `${label}, ${hint}` : label}
      onPress={onPress}
      style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 14, minHeight: 52, paddingHorizontal: 16, paddingVertical: 10, backgroundColor: pressed ? palette.wash : "transparent" })}
    >
      {icon}
      <View style={{ flex: 1, gap: 1 }}>
        <Text variant="body" tone={tone}>
          {label}
        </Text>
        {hint ? (
          <Text variant="subhead" tone="muted">
            {hint}
          </Text>
        ) : null}
      </View>
      <ChevronRight size={18} color={palette.rail} />
    </Pressable>
  );
}
