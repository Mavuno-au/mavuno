import { Stack } from "expo-router";
import { usePalette } from "@/ui/theme";

// Every tab is a stack of the same screens, so a post or a profile opens in
// the tab you're in and Back returns to where you were. Each tab starts on its own screen.
export const unstable_settings = {
  anchor: "index",
  discover: { anchor: "discover" },
  events: { anchor: "events" },
  messages: { anchor: "messages" },
  notifications: { anchor: "notifications" },
};

export default function TabStack() {
  const palette = usePalette();
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: palette.surface } }} />;
}
