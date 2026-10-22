import { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { font, Text } from "@/ui/text";
import { usePalette } from "@/ui/theme";
import { createEvent } from "@/util/events";

// The app's version of the website's toasts: one line saying what happened,
// with at most one action (Undo, View, Try again). It sits above the tab bar
// and goes after a few seconds, or when its action is used.
type ToastAction = { label: string; onPress: () => void };
export type Toast = { message: string; action?: ToastAction; duration?: number };

const shown = createEvent<Toast>();

export const toast = (message: string, options: Omit<Toast, "message"> = {}) => shown.emit({ message, ...options });

const TAB_BAR = 56;

export function ToastHost() {
  const palette = usePalette();
  const insets = useSafeAreaInsets();
  const [current, setCurrent] = useState<(Toast & { key: number }) | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const next = useRef(0);

  useEffect(
    () =>
      shown.on((value) => {
        if (timer.current) clearTimeout(timer.current);
        const key = ++next.current;
        setCurrent({ ...value, key });
        AccessibilityInfo.announceForAccessibility(value.message);
        timer.current = setTimeout(() => setCurrent((showing) => (showing?.key === key ? null : showing)), value.duration ?? (value.action ? 6000 : 3500));
      }),
    [],
  );

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  if (!current) return null;
  const { action } = current;
  return (
    <View pointerEvents="box-none" style={{ position: "absolute", left: 12, right: 12, bottom: insets.bottom + TAB_BAR + 8, alignItems: "center" }}>
      <View
        accessibilityLiveRegion="polite"
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 12,
          maxWidth: 520,
          minHeight: 48,
          paddingVertical: 10,
          paddingLeft: 16,
          paddingRight: action ? 8 : 16,
          borderRadius: 14,
          backgroundColor: palette.ink,
          shadowColor: "#000",
          shadowOpacity: 0.2,
          shadowRadius: 12,
          shadowOffset: { width: 0, height: 6 },
        }}
      >
        <Text variant="subhead" style={{ flexShrink: 1, color: palette.surface }}>
          {current.message}
        </Text>
        {action ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              setCurrent(null);
              action.onPress();
            }}
            hitSlop={6}
            style={({ pressed }) => ({ minHeight: 36, paddingHorizontal: 12, borderRadius: 10, justifyContent: "center", opacity: pressed ? 0.7 : 1 })}
          >
            <Text variant="subhead" style={{ fontFamily: font.semibold, color: palette.dark ? palette.primary : palette.primarySoft }}>
              {action.label}
            </Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}
