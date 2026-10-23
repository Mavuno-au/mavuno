import Constants from "expo-constants";
import { router, type Href } from "expo-router";
import { Bookmark, Building2, CalendarClock, FileText, Globe, KeyRound, LifeBuoy, LogOut, Mail, Palette, Scale, Shield, ShieldCheck, Trash, UserPlus } from "lucide-react-native";
import { Alert, Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CONTACT_EMAIL } from "@/lib/site";
import { siteLink } from "@/data/env";
import { signOut, useViewer } from "@/data/session";
import { Avatar } from "@/ui/avatar";
import { Group, Row } from "@/ui/form";
import { BackButton, Header } from "@/ui/header";
import { Text } from "@/ui/text";
import { usePalette } from "@/ui/theme";
import { openLink } from "@/util/links";

// The website's settings sections as an iOS grouped list on Mavuno's sand.
// Keyboard shortcuts are left out: they are for computers.
export default function Settings() {
  const palette = usePalette();
  const insets = useSafeAreaInsets();
  const viewer = useViewer();
  const icon = (Icon: typeof Mail, colour = palette.inkMuted) => <Icon size={20} color={colour} />;
  const go = (href: Href) => () => router.push(href);
  const web = (path: string) => () => openLink(siteLink(path));

  function confirmSignOut() {
    Alert.alert("Sign out of Mavuno?", undefined, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign out",
        style: "destructive",
        onPress: () => void signOut(),
      },
    ]);
  }

  return (
    <View style={{ flex: 1, backgroundColor: palette.shell }}>
      <Header title="Settings" left={<BackButton />} />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 22, paddingBottom: insets.bottom + 32 }}>
        {viewer ? (
          <Pressable
            accessibilityRole="link"
            accessibilityLabel={`${viewer.displayName}, your profile`}
            onPress={() => router.push(`/profile/${viewer.username}`)}
            style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 14, padding: 14, borderRadius: 14, backgroundColor: pressed ? palette.wash : palette.surface })}
          >
            <Avatar person={viewer} size={52} />
            <View style={{ flex: 1 }}>
              <Text variant="headline">{viewer.displayName}</Text>
              <Text variant="meta" tone="muted">
                @{viewer.username}
              </Text>
            </View>
          </Pressable>
        ) : null}
        <Group>
          <Row icon={icon(UserPlus, palette.primary)} label="Invite friends" onPress={go("/invite")} last />
        </Group>
        <Group>
          <Row icon={icon(KeyRound)} label="Account" onPress={go("/settings/account")} />
          <Row icon={icon(ShieldCheck)} label="Privacy" onPress={go("/settings/privacy")} />
          <Row icon={icon(Globe)} label="Languages" onPress={go("/settings/languages")} />
          <Row icon={icon(Palette)} label="Appearance" onPress={go("/settings/appearance")} />
          <Row icon={icon(Shield)} label="Muted and blocked" onPress={go("/settings/safety")} />
          <Row icon={icon(Building2)} label="Organisations" value={viewer && viewer.invitations.length > 0 ? `${viewer.invitations.length} new` : undefined} onPress={go("/settings/organisations")} last />
        </Group>
        <Group>
          <Row icon={icon(Bookmark)} label="Saved posts" onPress={go("/saved")} />
          <Row icon={icon(CalendarClock)} label="Scheduled posts" onPress={go("/scheduled")} last />
        </Group>
        <Group title="Help">
          <Row icon={icon(LifeBuoy)} label="Help centre" onPress={web("/help")} />
          <Row icon={icon(Mail)} label="Contact us" value={CONTACT_EMAIL} onPress={() => openLink(`mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent("Mavuno app")}`)} />
          <Row icon={icon(Shield)} label="Community rules" onPress={web("/rules")} />
          <Row icon={icon(FileText)} label="Privacy policy" onPress={web("/privacy")} />
          <Row icon={icon(Scale)} label="Terms" onPress={web("/terms")} last />
        </Group>
        <Group title={viewer ? `Signed in as @${viewer.username}` : undefined}>
          <Row icon={icon(LogOut)} label="Sign out" onPress={confirmSignOut} />
          <Row icon={icon(Trash, palette.destructive)} label="Delete account" tone="destructive" onPress={go("/delete-account")} last />
        </Group>
        <Text variant="caption" tone="muted" style={{ textAlign: "center" }}>
          Mavuno {Constants.expoConfig?.version ?? ""}
        </Text>
      </ScrollView>
    </View>
  );
}
