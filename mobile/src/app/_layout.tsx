import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import * as SystemUI from "expo-system-ui";
import { useEffect } from "react";
import { SessionProvider, useSession } from "@/data/session";
import { ShadowProvider } from "@/data/shadow";
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
  return (
    <>
      <StatusBar style="auto" />
      {/* Keyed on the member, so nothing one person opened, liked or followed stays for the next. */}
      <ShadowProvider key={signedIn ? session.session.user.id : "signed-out"}>
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: palette.surface } }}>
          {/* index is Home or, signed out, a redirect to Welcome; signing in lands back on it. */}
          <Stack.Screen name="index" />
          <Stack.Protected guard={signedIn} redirectTo="/welcome">
            <Stack.Screen name="post/[id]" />
            <Stack.Screen name="profile/[username]" />
          </Stack.Protected>
          <Stack.Protected guard={!signedIn} redirectTo="/">
            <Stack.Screen name="welcome" />
            <Stack.Screen name="sign-in" />
          </Stack.Protected>
        </Stack>
      </ShadowProvider>
    </>
  );
}
