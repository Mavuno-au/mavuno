import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import * as SystemUI from "expo-system-ui";
import { useEffect } from "react";
import { SessionProvider, useSession } from "@/data/session";
import { FONTS } from "@/ui/text";
import { usePalette } from "@/ui/theme";
import { NowProvider } from "@/util/time";

// The launch screen stays up until the fonts and the stored session are ready,
// so nothing flashes in the wrong font or the wrong screen.
void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts(FONTS);
  return (
    <SessionProvider>
      <NowProvider>
        <Navigator fontsReady={fontsLoaded || fontError !== null} />
      </NowProvider>
    </SessionProvider>
  );
}

function Navigator({ fontsReady }: { fontsReady: boolean }) {
  const session = useSession();
  const palette = usePalette();
  const ready = fontsReady && session.kind !== "loading";

  useEffect(() => {
    // Behind every screen, so a swipe back or a rotation never shows white in dark mode.
    void SystemUI.setBackgroundColorAsync(palette.surface);
  }, [palette.surface]);

  useEffect(() => {
    if (ready) void SplashScreen.hideAsync();
  }, [ready]);

  if (!ready) return null;
  const signedIn = session.kind === "signed-in";
  const active = signedIn && session.standing.kind === "active";
  return (
    <>
      <StatusBar style="auto" />
      {/* Keyed on the member, so nothing one person opened stays on the stack for the next. */}
      <Stack key={signedIn ? session.session.user.id : "signed-out"} screenOptions={{ headerShown: false, contentStyle: { backgroundColor: palette.surface } }}>
        {/* Each group says where a member who may not see it goes instead. */}
        <Stack.Protected guard={active} redirectTo={signedIn ? "/standing" : "/welcome"}>
          <Stack.Screen name="index" />
          <Stack.Screen name="post/[id]" />
          <Stack.Screen name="profile/[username]" />
          <Stack.Screen name="settings" />
          <Stack.Screen name="report" options={{ presentation: "modal" }} />
        </Stack.Protected>
        <Stack.Protected guard={signedIn && !active} redirectTo={signedIn ? "/" : "/welcome"}>
          <Stack.Screen name="standing" />
        </Stack.Protected>
        <Stack.Protected guard={signedIn} redirectTo="/welcome">
          <Stack.Screen name="delete-account" />
        </Stack.Protected>
        <Stack.Protected guard={!signedIn} redirectTo="/">
          <Stack.Screen name="welcome" />
          <Stack.Screen name="sign-in" />
        </Stack.Protected>
      </Stack>
    </>
  );
}
