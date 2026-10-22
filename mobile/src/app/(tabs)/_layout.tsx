import { Tabs } from "expo-router/js-tabs";
import { Bell, CalendarDays, Compass, House, MessageCircle, type LucideIcon } from "lucide-react-native";
import { z } from "zod";
import { badge, useCounts } from "@/data/counts";
import { font } from "@/ui/text";
import { usePalette } from "@/ui/theme";
import { emitSoftReset } from "@/util/events";

// Five tabs and no More tab, which Apple advises against: Spaces,
// Opportunities and Nearby live in Discover, and your profile, saved posts
// and settings sit behind your avatar on Home (the iPhone design's notes).
const TABS: { name: string; title: string; icon: LucideIcon }[] = [
  { name: "(home)", title: "Home", icon: House },
  { name: "(discover)", title: "Discover", icon: Compass },
  { name: "(events)", title: "Events", icon: CalendarDays },
  { name: "(messages)", title: "Messages", icon: MessageCircle },
  { name: "(notifications)", title: "Notifications", icon: Bell },
];

// Where the tab's own stack is; nothing is there until it has been opened.
const stackIndex = z.object({ index: z.number() });

export default function TabsLayout() {
  const palette = usePalette();
  const counts = useCounts();
  const badges: Record<string, string | undefined> = { "(messages)": badge(counts.messages), "(notifications)": badge(counts.notifications) };

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: palette.primary,
        tabBarInactiveTintColor: palette.inkMuted,
        tabBarStyle: { backgroundColor: palette.surface, borderTopColor: palette.hairline },
        // Tab labels stay their usual size, as Apple advises.
        tabBarLabelStyle: { fontFamily: font.medium, fontSize: 10 },
        tabBarAllowFontScaling: false,
        tabBarBadgeStyle: { backgroundColor: palette.primary, color: palette.primaryInk, fontFamily: font.semibold, fontSize: 11 },
        tabBarHideOnKeyboard: true,
      }}
      screenListeners={({ navigation, route }) => ({
        // Tapping the tab you're on goes back to its first screen; on that
        // screen, it scrolls to the top and refreshes.
        tabPress: () => {
          const tab = navigation.getState().routes.find((candidate: { key: string }) => candidate.key === route.key);
          const index = stackIndex.safeParse(tab?.state).data?.index ?? 0;
          if (navigation.isFocused() && index === 0) emitSoftReset();
        },
      })}
    >
      {TABS.map(({ name, title, icon: Icon }) => (
        <Tabs.Screen
          key={name}
          name={name}
          options={{
            title,
            tabBarAccessibilityLabel: badges[name] ? `${title}, ${badges[name]} new` : title,
            tabBarBadge: badges[name],
            tabBarIcon: ({ color, focused }) => <Icon size={24} color={color} strokeWidth={focused ? 2.3 : 1.8} />,
          }}
        />
      ))}
    </Tabs>
  );
}
