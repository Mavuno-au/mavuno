import { Users } from "lucide-react-native";
import { View } from "react-native";
import type { Conversation } from "@/lib/messages";
import { Avatar } from "@/ui/avatar";
import { usePalette } from "@/ui/theme";

// The other person in a direct conversation; two faces for a group.
export function ConversationAvatar({ conversation, size = 44 }: { conversation: Conversation; size?: number }) {
  const palette = usePalette();
  const [first, second] = conversation.members;
  if (conversation.other) return <Avatar person={conversation.other} size={size} />;
  if (first && second) {
    const small = size * 0.7;
    return (
      <View style={{ width: size, height: size }}>
        <View style={{ position: "absolute", left: 0, top: 0 }}>
          <Avatar person={first} size={small} />
        </View>
        <View style={{ position: "absolute", right: 0, bottom: 0, borderRadius: small, borderWidth: 2, borderColor: palette.surface }}>
          <Avatar person={second} size={small - 4} />
        </View>
      </View>
    );
  }
  if (first) return <Avatar person={first} size={size} />;
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: palette.wash, alignItems: "center", justifyContent: "center" }}>
      <Users size={size * 0.45} color={palette.inkMuted} />
    </View>
  );
}
