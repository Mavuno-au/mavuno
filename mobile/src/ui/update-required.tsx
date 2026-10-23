import { CircleArrowUp } from "lucide-react-native";
import { Linking, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { AppRelease } from "@/lib/app-release";
import { Button, EmptyState } from "@/ui/controls";
import { usePalette } from "@/ui/theme";

// Shown in place of the whole app when this build no longer works with mavuno.au.
export function UpdateRequired({ release }: { release: AppRelease }) {
  const palette = usePalette();
  const insets = useSafeAreaInsets();
  const { storeUrl } = release;
  return (
    <View style={{ flex: 1, justifyContent: "center", paddingTop: insets.top, paddingBottom: insets.bottom, paddingLeft: insets.left, paddingRight: insets.right, backgroundColor: palette.surface }}>
      <EmptyState
        icon={<CircleArrowUp size={26} color={palette.inkMuted} />}
        title="Update Mavuno"
        action={storeUrl ? <Button label="Open the App Store" size="medium" onPress={() => void Linking.openURL(storeUrl).catch(() => undefined)} /> : undefined}
      >
        This version of Mavuno no longer works. Update it from the App Store to carry on; your account and posts are as you left them.
      </EmptyState>
    </View>
  );
}
