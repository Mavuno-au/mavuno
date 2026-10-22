import { SearchX } from "lucide-react-native";
import { View } from "react-native";
import { EmptyState } from "@/ui/controls";
import { BackButton, Header } from "@/ui/header";
import { usePalette } from "@/ui/theme";

export default function NotFound() {
  const palette = usePalette();
  return (
    <View style={{ flex: 1, backgroundColor: palette.surface }}>
      <Header left={<BackButton />} />
      <EmptyState icon={<SearchX size={26} color={palette.inkMuted} />} title="We couldn't find that">
        The page may have moved, or the post or profile was deleted.
      </EmptyState>
    </View>
  );
}
