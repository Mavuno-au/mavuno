import { router } from "expo-router";
import { ExternalLink, Flag, UserX, Volume2, VolumeX } from "lucide-react-native";
import { Alert } from "react-native";
import { setRelation } from "@/data/relations";
import { useSession } from "@/data/session";
import { useShadowWriter } from "@/data/shadow";
import type { SheetAction } from "@/ui/sheet";
import { usePalette } from "@/ui/theme";
import { openLink } from "@/util/links";

type Person = { id: string; username: string; muted: boolean };
export type ReportTarget = { type: "post" | "profile" | "message" | "event" | "opportunity" | "space"; id: string };

// The same three actions wherever someone else's post or profile is shown,
// with the website's wording (src/components/people/profile-actions.tsx).
export function useSafetyActions(person: Person) {
  const palette = usePalette();
  const session = useSession();
  const viewerId = session.kind === "signed-in" ? session.session.user.id : null;
  const { setFollowing } = useShadowWriter();
  const handle = `@${person.username}`;

  async function mute(on: boolean) {
    if (!viewerId) return;
    const result = await setRelation("mute", viewerId, person.id, on);
    if (!result.ok) return Alert.alert(on ? "Couldn't mute" : "Couldn't unmute", result.error);
    if (on) Alert.alert(`Muted ${handle}`, "Their posts won't show in your feeds. You can undo this here or in Settings › Safety.");
  }

  function confirmBlock() {
    Alert.alert(
      `Block ${handle}?`,
      "You'll stop following each other, and unblocking later won't bring those follows back. Neither of you can message, follow or reply to the other, and you won't see each other's posts. They won't be told.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Block",
          style: "destructive",
          onPress: () => {
            if (!viewerId) return;
            void setRelation("block", viewerId, person.id, true).then((result) => {
              if (!result.ok) return Alert.alert("Couldn't block", result.error);
              // The database ends both follows, so a Follow tapped earlier mustn't linger.
              setFollowing(person.id, false);
            });
          },
        },
      ],
    );
  }

  async function unblock() {
    if (!viewerId) return;
    const result = await setRelation("block", viewerId, person.id, false);
    if (!result.ok) Alert.alert("Couldn't unblock", result.error);
  }

  const actions = ({ report }: { report: ReportTarget }): SheetAction[] => [
    person.muted
      ? { label: `Unmute ${handle}`, icon: <Volume2 size={20} color={palette.inkMuted} />, onPress: () => void mute(false) }
      : { label: `Mute ${handle}`, icon: <VolumeX size={20} color={palette.inkMuted} />, onPress: () => void mute(true) },
    { label: `Block ${handle}`, icon: <UserX size={20} color={palette.destructive} />, destructive: true, onPress: confirmBlock },
    {
      label: `Report ${report.type}`,
      icon: <Flag size={20} color={palette.destructive} />,
      destructive: true,
      onPress: () => router.push({ pathname: "/report", params: report }),
    },
  ];

  const website = (href: string): SheetAction => ({ label: "Open on the website", icon: <ExternalLink size={20} color={palette.inkMuted} />, onPress: () => openLink(href) });

  return { actions, website, unblock };
}
