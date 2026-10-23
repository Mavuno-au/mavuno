import { useFonts } from "expo-font";
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import * as SystemUI from "expo-system-ui";
import { useEffect } from "react";
import { View } from "react-native";
import { CountsProvider } from "@/data/counts";
import "@/data/preferences";
import { PushNotifications } from "@/data/push";
import { useRequiredUpdate } from "@/data/release";
import { SessionProvider, useSession } from "@/data/session";
import { ShadowProvider } from "@/data/shadow";
import { AppCrash, ScreenCrash } from "@/ui/crash";
import { FONTS } from "@/ui/text";
import { usePalette } from "@/ui/theme";
import { ToastHost } from "@/ui/toast";
import { UpdateRequired } from "@/ui/update-required";
import { NowProvider } from "@/util/time";

// The launch screen stays up until the fonts and the stored session are ready,
// so nothing flashes in the wrong font or the wrong screen.
void SplashScreen.preventAutoHideAsync();

// A render error shows Something went wrong rather than closing the app: in
// place of the screen that threw, or of everything when the frame itself did.
export const ErrorBoundary = AppCrash;
export const unstable_settings = { screenErrorBoundary: ScreenCrash };

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
  const update = useRequiredUpdate();

  useEffect(() => {
    // Behind every screen, so a swipe back or a rotation never shows white in dark mode.
    void SystemUI.setBackgroundColorAsync(palette.surface);
  }, [palette.surface]);

  useEffect(() => {
    if (ready) void SplashScreen.hideAsync();
  }, [ready]);

  if (!ready) return null;
  if (update) return <UpdateRequired release={update} />;
  const signedIn = session.kind === "signed-in";
  const viewer = signedIn ? session.viewer : null;
  const active = signedIn && session.standing.kind === "active";
  // The website's onboarding gate, in its order: the age question, then the
  // four steps. Until the member's row has loaded they go straight in.
  const needsAge = active && viewer?.age.kind === "unconfirmed";
  const needsOnboarding = active && !needsAge && viewer !== null && !viewer.onboarded;
  const member = active && !needsAge && !needsOnboarding;
  const home = !signedIn ? "/welcome" : !active ? "/standing" : needsAge ? "/onboarding/age" : needsOnboarding ? "/onboarding" : "/";
  const theme = palette.dark ? DarkTheme : DefaultTheme;

  return (
    <ThemeProvider value={{ ...theme, colors: { ...theme.colors, background: palette.surface, card: palette.surface, border: palette.hairline, primary: palette.primary, text: palette.ink } }}>
      <StatusBar style="auto" />
      {/* Keyed on the member, so nothing one person opened, liked or followed stays for the next. */}
      <ShadowProvider key={signedIn ? session.session.user.id : "signed-out"}>
        <CountsProvider viewerId={member ? session.session.user.id : null}>
          <View style={{ flex: 1, backgroundColor: palette.surface }}>
            <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: palette.surface } }}>
              {/* Each group says where a member who may not see it goes instead. */}
              <Stack.Protected guard={member} redirectTo={home}>
                <Stack.Screen name="(tabs)" />
                {/* A conversation covers the tab bar, so the keyboard and message field have room. Opening one
                    already in the stack, from a notification say, brings that screen forward rather than a second copy. */}
                <Stack.Screen name="conversation/[id]" getId={({ params }) => (typeof params?.id === "string" ? params.id : undefined)} />
                <Stack.Screen name="group/[id]" />
                <Stack.Screen name="new-message" options={{ presentation: "modal" }} />
                <Stack.Screen name="compose" options={{ presentation: "modal", gestureEnabled: false }} />
                <Stack.Screen name="report" options={{ presentation: "modal" }} />
                <Stack.Screen name="likers/[id]" options={{ presentation: "formSheet", sheetAllowedDetents: [0.5, 1], sheetGrabberVisible: true }} />
                <Stack.Screen name="photos" options={{ presentation: "fullScreenModal", animation: "fade" }} />
                <Stack.Screen name="edit-profile" options={{ presentation: "modal", gestureEnabled: false }} />
                <Stack.Screen name="event-form" options={{ presentation: "modal", gestureEnabled: false }} />
                <Stack.Screen name="opportunity-form" options={{ presentation: "modal", gestureEnabled: false }} />
                <Stack.Screen name="space-form" options={{ presentation: "modal", gestureEnabled: false }} />
                <Stack.Screen name="organisation-form" options={{ presentation: "modal", gestureEnabled: false }} />
              </Stack.Protected>
              <Stack.Protected guard={needsAge} redirectTo={home}>
                <Stack.Screen name="onboarding/age" />
              </Stack.Protected>
              <Stack.Protected guard={needsOnboarding} redirectTo={home}>
                <Stack.Screen name="onboarding/index" />
              </Stack.Protected>
              <Stack.Protected guard={signedIn && !active} redirectTo={home}>
                <Stack.Screen name="standing" />
              </Stack.Protected>
              <Stack.Protected guard={signedIn} redirectTo="/welcome">
                <Stack.Screen name="delete-account" />
              </Stack.Protected>
              {/* Invite and email links open for everyone and send each person where they belong. */}
              <Stack.Screen name="join/[username]" />
              <Stack.Screen name="auth/confirm" />
              <Stack.Protected guard={!signedIn} redirectTo={home}>
                <Stack.Screen name="welcome" />
                <Stack.Screen name="sign-in" />
                <Stack.Screen name="forgot-password" />
                <Stack.Screen name="join/index" />
                <Stack.Screen name="join/details" />
                <Stack.Screen name="join/check-email" />
                <Stack.Screen name="join/under-16" />
              </Stack.Protected>
            </Stack>
            <ToastHost />
            <PushNotifications viewerId={member ? session.session.user.id : null} />
          </View>
        </CountsProvider>
      </ShadowProvider>
    </ThemeProvider>
  );
}
