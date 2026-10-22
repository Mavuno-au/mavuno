import { router, type Href } from "expo-router";
import { ChevronLeft } from "lucide-react-native";
import type { ReactNode } from "react";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { IconButton } from "@/ui/controls";
import { Text } from "@/ui/text";
import { usePalette } from "@/ui/theme";

// Every screen starts with a 52-point bar under the status bar (the design's
// header): a back button or the viewer's avatar, a title, and actions. A sheet
// has no status bar above it, so `inset` is off there.
export function Header({ title, left, right, children, inset = true }: { title?: string; left?: ReactNode; right?: ReactNode; children?: ReactNode; inset?: boolean }) {
  const palette = usePalette();
  const insets = useSafeAreaInsets();
  return (
    <View style={{ paddingTop: inset ? insets.top : 4, backgroundColor: palette.surface }}>
      <View style={{ minHeight: 52, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", gap: 8 }}>
        <View style={{ minWidth: 44, flexDirection: "row" }}>{left}</View>
        <View style={{ flex: 1, alignItems: "center" }}>
          {children ??
            (title ? (
              <Text variant="headline" accessibilityRole="header" numberOfLines={1} maxFontSizeMultiplier={1.6}>
                {title}
              </Text>
            ) : null)}
        </View>
        <View style={{ minWidth: 44, flexDirection: "row", justifyContent: "flex-end", gap: 8 }}>{right}</View>
      </View>
    </View>
  );
}

// `fallback` is where Back goes when the screen was opened first, from a link or at launch.
export function BackButton({ label = "Back", fallback = "/" }: { label?: string; fallback?: Href }) {
  const palette = usePalette();
  return (
    <IconButton label={label} onPress={() => (router.canGoBack() ? router.back() : router.replace(fallback))}>
      <ChevronLeft size={20} color={palette.ink} strokeWidth={2.2} />
    </IconButton>
  );
}
