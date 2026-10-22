import * as Clipboard from "expo-clipboard";
import { router } from "expo-router";
import { Copy, MessageCircle, Share } from "lucide-react-native";
import { useEffect, useState } from "react";
import { Linking, Platform, Pressable, ScrollView, Share as NativeShare, View } from "react-native";
import { INVITE_TEXT, inviteMessage, inviteUrl, whatsAppLink } from "@/lib/invites";
import { env } from "@/data/env";
import { loadInvitees } from "@/data/profiles";
import { useViewer } from "@/data/session";
import { Avatar } from "@/ui/avatar";
import { Button } from "@/ui/controls";
import { BackButton, Header } from "@/ui/header";
import { font, Text } from "@/ui/text";
import { usePalette } from "@/ui/theme";
import { toast } from "@/ui/toast";
import { timeZone } from "@/util/time";

type Invitee = Awaited<ReturnType<typeof loadInvitees>>[number];

// Your invite link, mavuno.au/join/<username>. Whoever joins with it and you
// follow each other. Send on WhatsApp comes first because that is where most
// of the community talks. No counts, rewards or rankings (PRODUCT.md).
export default function Invite() {
  const palette = usePalette();
  const viewer = useViewer();
  const [invitees, setInvitees] = useState<Invitee[] | null>(null);
  const viewerId = viewer?.id ?? null;

  useEffect(() => {
    if (!viewerId) return;
    let current = true;
    void loadInvitees(viewerId)
      .then((people) => current && setInvitees(people))
      .catch(() => current && setInvitees([]));
    return () => {
      current = false;
    };
  }, [viewerId]);

  if (!viewer) return null;
  const url = inviteUrl(env.siteUrl, viewer.username);

  return (
    <View style={{ flex: 1, backgroundColor: palette.surface }}>
      <Header title="Invite friends" left={<BackButton />} />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 20 }}>
        <View style={{ gap: 8 }}>
          <Text variant="title" accessibilityRole="header">
            Bring your people
          </Text>
          <Text variant="callout" tone="muted">
            Anyone who joins with your link follows you, and you follow them back, so you're connected from their first day.
          </Text>
        </View>
        <View style={{ padding: 14, borderRadius: 14, backgroundColor: palette.wash, gap: 6 }}>
          <Text variant="small" tone="muted">
            Your link
          </Text>
          <Text variant="meta" selectable style={{ fontSize: 15 }}>
            {url}
          </Text>
        </View>
        <View style={{ gap: 10 }}>
          <Button
            label="Send on WhatsApp"
            icon={<MessageCircle size={18} color={palette.primaryInk} />}
            onPress={() => void Linking.openURL(whatsAppLink(url)).catch(() => toast("WhatsApp isn't on this phone. Copy the link instead."))}
          />
          <Button
            label="Share link"
            variant="outline"
            icon={<Share size={18} color={palette.ink} />}
            onPress={() => void NativeShare.share(Platform.OS === "ios" ? { message: INVITE_TEXT, url } : { message: inviteMessage(url) })}
          />
          <Button label="Copy link" variant="plain" icon={<Copy size={18} color={palette.inkMuted} />} onPress={() => void Clipboard.setStringAsync(url).then(() => toast("Link copied"))} />
        </View>
        <View style={{ gap: 10 }}>
          <Text variant="heading" accessibilityRole="header">
            Joined from your invite
          </Text>
          <Text variant="small" tone="muted">
            Only you and they can see this.
          </Text>
          {invitees === null ? null : invitees.length === 0 ? (
            <Text variant="callout" tone="muted">
              Nobody yet. When someone joins with your link, they show here.
            </Text>
          ) : (
            invitees.map((person) => (
              <Pressable
                key={person.id}
                accessibilityRole="link"
                accessibilityLabel={`${person.displayName}, joined ${new Date(person.joinedAt).toLocaleDateString("en-AU", { day: "numeric", month: "long", timeZone })}`}
                onPress={() => router.push(`/profile/${person.username}`)}
                style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 12, minHeight: 56, borderRadius: 12, paddingHorizontal: 4, backgroundColor: pressed ? palette.wash : "transparent" })}
              >
                <Avatar person={person} size={40} />
                <View style={{ flex: 1 }}>
                  <Text variant="name">{person.displayName}</Text>
                  <Text variant="caption" tone="muted">
                    Joined {new Date(person.joinedAt).toLocaleDateString("en-AU", { day: "numeric", month: "long", timeZone })}
                  </Text>
                </View>
                <Text variant="subhead" tone="primary" style={{ fontFamily: font.medium }}>
                  View
                </Text>
              </Pressable>
            ))
          )}
        </View>
      </ScrollView>
    </View>
  );
}
