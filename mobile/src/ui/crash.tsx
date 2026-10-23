import type { ErrorBoundaryProps } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { TriangleAlert } from "lucide-react-native";
import { useEffect } from "react";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button, EmptyState } from "@/ui/controls";
import { BackButton, Header } from "@/ui/header";
import { usePalette } from "@/ui/theme";

function Crash({ retry }: Pick<ErrorBoundaryProps, "retry">) {
  const palette = usePalette();
  return (
    <EmptyState icon={<TriangleAlert size={26} color={palette.inkMuted} />} title="Something went wrong" action={<Button label="Try again" size="medium" onPress={() => void retry()} />}>
      {"Mavuno couldn't show this. Trying again usually works; if it doesn't, close the app and open it again."}
    </EmptyState>
  );
}

// A screen that throws while drawing shows this in its place, and the tab bar
// and the screens behind it stay where they were.
export function ScreenCrash({ retry }: ErrorBoundaryProps) {
  const palette = usePalette();
  return (
    <View style={{ flex: 1, backgroundColor: palette.surface }}>
      <Header left={<BackButton />} />
      <Crash retry={retry} />
    </View>
  );
}

// When the app's frame itself throws there is no navigator to go back in, and
// the launch screen may still be up over everything.
export function AppCrash({ retry }: ErrorBoundaryProps) {
  const palette = usePalette();
  const insets = useSafeAreaInsets();
  useEffect(() => {
    void SplashScreen.hideAsync();
  }, []);
  return (
    <View style={{ flex: 1, justifyContent: "center", paddingTop: insets.top, paddingBottom: insets.bottom, paddingLeft: insets.left, paddingRight: insets.right, backgroundColor: palette.surface }}>
      <Crash retry={retry} />
    </View>
  );
}
