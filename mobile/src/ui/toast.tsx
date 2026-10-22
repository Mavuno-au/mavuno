import { useIsFocused, useSegments } from "expo-router";
import { CircleAlert } from "lucide-react-native";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type ComponentRef } from "react";
import { AccessibilityInfo, Keyboard, Platform, Pressable, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { font, Text } from "@/ui/text";
import { usePalette } from "@/ui/theme";
import { createEvent } from "@/util/events";

// The app's version of the website's toasts: one line saying what happened,
// with at most one action (Undo, View, Try again). It sits above the tab bar,
// the keyboard and any bar along the bottom of the screen, and goes after a
// few seconds, or when its action is used. A failed tap on a toggle (a like,
// a save) is an error toast rather than an alert: the screen has already put
// the toggle back, so there is nothing to answer.
type ToastAction = { label: string; onPress: () => void };
export type Toast = { message: string; tone?: "error"; action?: ToastAction; duration?: number };

const shown = createEvent<Toast>();

export const toast = (message: string, options: Omit<Toast, "message"> = {}) => shown.emit({ message, ...options });

// The tab bar's height above the home indicator, with a little room.
const TAB_BAR = 56;
const GAP = 8;

// Bars along the bottom of a screen (a message field, the reply bar, the
// offline notice), each as its distance from the bottom of the window.
const floors = new Map<number, number>();
const floorsChanged = createEvent();
let nextFloor = 0;

function setFloor(id: number, distance: number | null) {
  if (distance === null ? !floors.has(id) : floors.get(id) === distance) return;
  if (distance === null) floors.delete(id);
  else floors.set(id, distance);
  floorsChanged.emit();
}

const highestFloor = () => Math.max(0, ...floors.values());

// Keeps toasts above the view it is given while that view's screen is in front.
export function useToastFloor(active = true) {
  const ref = useRef<ComponentRef<typeof View>>(null);
  const [id] = useState(() => ++nextFloor);
  const focused = useIsFocused();
  const { height } = useWindowDimensions();
  const on = active && focused;

  const measure = useCallback(() => {
    if (!on) return;
    ref.current?.measureInWindow((_x, y) => setFloor(id, Math.max(height - y, 0)));
  }, [on, height, id]);

  useEffect(() => {
    measure();
    return () => setFloor(id, null);
  }, [measure, id]);

  return { ref, onLayout: measure };
}

function useKeyboardHeight() {
  const [height, setHeight] = useState(0);
  useEffect(() => {
    // iOS says where the keyboard is going before it moves; Android only once it has.
    const show = Keyboard.addListener(Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow", (event) => setHeight(event.endCoordinates.height));
    const hide = Keyboard.addListener(Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide", () => setHeight(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return height;
}

export function ToastHost() {
  const palette = usePalette();
  const insets = useSafeAreaInsets();
  const segments = useSegments();
  const keyboard = useKeyboardHeight();
  const floor = useSyncExternalStore(floorsChanged.on, highestFloor);
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
        timer.current = setTimeout(() => setCurrent((showing) => (showing?.key === key ? null : showing)), value.duration ?? (value.action ? 6000 : value.tone === "error" ? 5000 : 3500));
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
  // The tab bar hides while the keyboard is up.
  const tabs = segments[0] === "(tabs)";
  const base = keyboard > 0 ? keyboard : insets.bottom + (tabs ? TAB_BAR : 0);
  return (
    <View pointerEvents="box-none" style={{ position: "absolute", left: 12, right: 12, bottom: Math.max(base, floor) + GAP, alignItems: "center" }}>
      <View
        accessibilityLiveRegion="polite"
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 10,
          maxWidth: 520,
          minHeight: 48,
          paddingVertical: 10,
          paddingLeft: current.tone === "error" ? 12 : 16,
          paddingRight: action ? 8 : 16,
          borderRadius: 14,
          backgroundColor: palette.ink,
          shadowColor: "#000",
          shadowOpacity: 0.2,
          shadowRadius: 12,
          shadowOffset: { width: 0, height: 6 },
        }}
      >
        {/* The toast is drawn in the other theme's colours, so its red is that theme's too. */}
        {current.tone === "error" ? <CircleAlert size={20} color={palette.dark ? "#c2341b" : "#ff6b57"} /> : null}
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
