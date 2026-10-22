import { CloudOff } from "lucide-react-native";
import { useEffect, useState, type ReactNode } from "react";
import { ActivityIndicator, Animated, Easing, Pressable, ScrollView, View, type DimensionValue, type PressableProps, type StyleProp, type ViewStyle } from "react-native";
import { PROBLEM, type Reason } from "@/data/errors";
import { font, Text } from "@/ui/text";
import { HAIRLINE, usePalette } from "@/ui/theme";
import { haptics } from "@/util/haptics";
import { useReduceMotion } from "@/util/motion";

// Every control is at least 44 points square (Apple's minimum) and grows with
// the text inside it, so large text sizes never clip a label.

export function Button({
  label,
  hint,
  onPress,
  variant = "primary",
  size = "large",
  busy = false,
  disabled = false,
  icon,
  style,
}: {
  label: string;
  hint?: string;
  onPress: () => void;
  variant?: "primary" | "outline" | "plain" | "destructive";
  size?: "large" | "medium";
  busy?: boolean;
  disabled?: boolean;
  icon?: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const palette = usePalette();
  const height = size === "large" ? 54 : 44;
  const colours = {
    primary: { background: palette.primary, border: palette.primary, text: "primaryInk" as const },
    outline: { background: palette.surface, border: palette.rail, text: "ink" as const },
    plain: { background: "transparent", border: "transparent", text: "muted" as const },
    destructive: { background: palette.destructive, border: palette.destructive, text: "primaryInk" as const },
  }[variant];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint}
      accessibilityState={{ disabled: disabled || busy, busy }}
      disabled={disabled || busy}
      onPress={onPress}
      style={({ pressed }) => [
        {
          minHeight: height,
          paddingHorizontal: size === "large" ? 24 : 20,
          paddingVertical: 8,
          borderRadius: height / 2,
          borderWidth: variant === "outline" ? 1 : 0,
          borderColor: colours.border,
          backgroundColor: colours.background,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          opacity: pressed ? 0.75 : disabled ? 0.5 : 1,
        },
        style,
      ]}
    >
      {busy ? <ActivityIndicator color={colours.text === "primaryInk" ? palette.primaryInk : palette.inkMuted} /> : icon}
      <Text variant={variant === "plain" ? "callout" : size === "large" ? "headline" : "label"} tone={colours.text}>
        {label}
      </Text>
    </Pressable>
  );
}

// The round, bordered buttons in the iPhone design's headers.
export function IconButton({ label, onPress, children, ...props }: { label: string; onPress: () => void; children: ReactNode } & Omit<PressableProps, "children" | "style">) {
  const palette = usePalette();
  return (
    <Pressable
      {...props}
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={4}
      style={({ pressed }) => ({
        width: 44,
        height: 44,
        borderRadius: 22,
        borderWidth: 1,
        borderColor: palette.hairline,
        backgroundColor: pressed ? palette.wash : palette.popover,
        alignItems: "center",
        justifyContent: "center",
        shadowColor: "#000",
        shadowOpacity: 0.06,
        shadowRadius: 3,
        shadowOffset: { width: 0, height: 1 },
      })}
    >
      {children}
    </Pressable>
  );
}

// iOS-style segmented control: the design swaps the website's underlined tabs for this.
// One thumb slides to the chosen segment, as UISegmentedControl's does, and
// is placed without moving under Reduce Motion. The segments share the width
// equally, so the thumb's place is a fraction of it and nothing is measured.
export function Segmented<Key extends string>({ label, options, value, onChange }: { label: string; options: readonly { key: Key; label: string }[]; value: Key; onChange: (key: Key) => void }) {
  const palette = usePalette();
  const reduceMotion = useReduceMotion();
  const index = Math.max(0, options.findIndex((option) => option.key === value));
  const [place] = useState(() => new Animated.Value(index));
  useEffect(() => {
    if (reduceMotion) return place.setValue(index);
    const slide = Animated.timing(place, { toValue: index, duration: 300, easing: Easing.out(Easing.exp), useNativeDriver: false });
    slide.start();
    return () => slide.stop();
  }, [index, place, reduceMotion]);
  const share = 100 / Math.max(options.length, 1);
  const left = options.length > 1 ? place.interpolate({ inputRange: [0, options.length - 1], outputRange: ["0%", `${share * (options.length - 1)}%`] }) : "0%";
  return (
    <View accessibilityRole="tablist" accessibilityLabel={label} style={{ flexDirection: "row", padding: 3, borderRadius: 22, backgroundColor: palette.wash, minHeight: 44 }}>
      <View pointerEvents="none" style={{ position: "absolute", top: 3, bottom: 3, left: 3, right: 3 }}>
        <Animated.View
          style={{
            position: "absolute",
            top: 0,
            bottom: 0,
            left,
            width: `${share}%`,
            borderRadius: 19,
            backgroundColor: palette.popover,
            shadowColor: "#000",
            shadowOpacity: 0.12,
            shadowRadius: 3,
            shadowOffset: { width: 0, height: 1 },
          }}
        />
      </View>
      {options.map((option) => {
        const selected = option.key === value;
        return (
          <Pressable
            key={option.key}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            onPress={() => {
              if (!selected) haptics.selection();
              onChange(option.key);
            }}
            style={{ flex: 1, minHeight: 38, paddingVertical: 6, paddingHorizontal: 8, alignItems: "center", justifyContent: "center" }}
          >
            <Text variant="label" tone={selected ? "ink" : "muted"} maxFontSizeMultiplier={1.6} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75} style={selected ? undefined : { fontFamily: font.medium }}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// A scrolling row of filters, for where a segmented control's labels
// wouldn't fit at large text sizes. The gutter is inside the row, so pills
// scroll to the screen's edge. Not the list's scroller: a tap on the status
// bar goes to the list.
export function Pills<Key extends string>({ label, options, value, onChange }: { label: string; options: readonly { key: Key; label: string }[]; value: Key; onChange: (key: Key) => void }) {
  const palette = usePalette();
  return (
    <ScrollView horizontal scrollsToTop={false} showsHorizontalScrollIndicator={false} accessibilityRole="tablist" accessibilityLabel={label} contentContainerStyle={{ gap: 8, paddingHorizontal: 16 }}>
      {options.map((option) => {
        const selected = option.key === value;
        return (
          <Pressable
            key={option.key}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            onPress={() => {
              if (!selected) haptics.selection();
              onChange(option.key);
            }}
            style={({ pressed }) => ({
              minHeight: 40,
              paddingHorizontal: 16,
              borderRadius: 20,
              borderWidth: 1,
              borderColor: selected ? palette.primary : palette.rail,
              backgroundColor: selected ? palette.primary : pressed ? palette.wash : palette.surface,
              justifyContent: "center",
            })}
          >
            <Text variant="callout" tone={selected ? "primaryInk" : "ink"} style={{ fontFamily: font.medium }} maxFontSizeMultiplier={1.6}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

// One bold line and one plain sentence, with a single action when there is somewhere to go.
export function EmptyState({ icon, title, children, action }: { icon?: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  const palette = usePalette();
  return (
    <View style={{ alignItems: "center", gap: 8, paddingHorizontal: 36, paddingVertical: 28 }}>
      {icon ? (
        <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: palette.wash, alignItems: "center", justifyContent: "center" }}>{icon}</View>
      ) : null}
      <Text variant="heading" accessibilityRole="header" style={{ marginTop: icon ? 6 : 0, textAlign: "center" }}>
        {title}
      </Text>
      {children ? (
        <Text variant="callout" tone="muted" style={{ textAlign: "center" }}>
          {children}
        </Text>
      ) : null}
      {action ? <View style={{ marginTop: 6 }}>{action}</View> : null}
    </View>
  );
}

// What didn't load and why, the reader's connection or Mavuno, with Try again.
export function LoadFailed({ title, reason, onRetry }: { title: string; reason: Reason; onRetry: () => void }) {
  const palette = usePalette();
  return (
    <EmptyState icon={<CloudOff size={26} color={palette.inkMuted} />} title={title} action={<Button label="Try again" size="medium" onPress={onRetry} />}>
      {PROBLEM[reason]}
    </EmptyState>
  );
}

export function EndOfList({ children }: { children: ReactNode }) {
  return (
    <Text variant="subhead" tone="muted" style={{ textAlign: "center", paddingHorizontal: 24, paddingVertical: 32 }}>
      {children}
    </Text>
  );
}

export function Chip({ children, tone = "muted" }: { children: ReactNode; tone?: "muted" | "primary" | "warning" | "danger" }) {
  const palette = usePalette();
  const colours = {
    muted: { background: palette.wash, text: "ink" as const },
    primary: { background: palette.primarySoft, text: "primary" as const },
    warning: { background: palette.warning, text: "ink" as const },
    danger: { background: palette.destructiveSoft, text: "destructive" as const },
  }[tone];
  return (
    <View style={{ alignSelf: "flex-start", borderRadius: 7, paddingHorizontal: 9, paddingVertical: 3, backgroundColor: colours.background }}>
      <Text variant="small" tone={colours.text} style={{ fontFamily: font.medium }}>
        {children}
      </Text>
    </View>
  );
}

function Bar({ width, height = 12 }: { width: DimensionValue; height?: number }) {
  const palette = usePalette();
  return <View style={{ width, height, borderRadius: Math.min(height / 2, 6), backgroundColor: palette.wash }} />;
}

const LINE_WIDTHS: DimensionValue[][] = [
  ["42%", "88%", "64%"],
  ["34%", "72%", "80%"],
  ["50%", "92%", "58%"],
  ["38%", "66%", "74%"],
];

// Stands in for a list of people, spaces or opportunities: what leads the row
// (an avatar, a space's photo, none) and how many lines of text follow it.
export function RowSkeleton({ leading = "circle", lines = 2, rows = 6, label = "Loading" }: { leading?: "circle" | "square" | "none"; lines?: number; rows?: number; label?: string }) {
  const palette = usePalette();
  return (
    <View accessible accessibilityLabel={label} accessibilityState={{ busy: true }}>
      {Array.from({ length: rows }, (_, index) => (
        <View key={index} style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: HAIRLINE, borderBottomColor: palette.hairline }}>
          {leading === "none" ? null : <View style={{ width: 44, height: 44, borderRadius: leading === "circle" ? 22 : 12, backgroundColor: palette.wash }} />}
          <View style={{ flex: 1, gap: 9 }}>
            {(LINE_WIDTHS[index % LINE_WIDTHS.length] ?? []).slice(0, lines).map((width, line) => (
              <Bar key={line} width={width} />
            ))}
          </View>
        </View>
      ))}
    </View>
  );
}

// The notification rows' shape: the kind's ring, who did it, and what they did.
export function NotificationSkeleton({ rows = 6 }: { rows?: number }) {
  const palette = usePalette();
  return (
    <View accessible accessibilityLabel="Loading notifications" accessibilityState={{ busy: true }}>
      {Array.from({ length: rows }, (_, index) => (
        <View key={index} style={{ flexDirection: "row", gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: HAIRLINE, borderBottomColor: palette.hairline }}>
          <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: palette.wash, marginTop: 2 }} />
          <View style={{ flex: 1, gap: 10 }}>
            <View style={{ flexDirection: "row", gap: 5 }}>
              {Array.from({ length: (index % 3) + 1 }, (_, avatar) => (
                <View key={avatar} style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: palette.wash }} />
              ))}
            </View>
            {(LINE_WIDTHS[index % LINE_WIDTHS.length] ?? []).slice(1, 3).map((width, line) => (
              <Bar key={line} width={width} />
            ))}
          </View>
        </View>
      ))}
    </View>
  );
}

// A profile's or a space's header while it loads: the avatar (a profile's),
// the name and the line under it, the posts' tabs or the space's "Post in"
// field, then posts.
export function PageSkeleton({ avatar = false, label }: { avatar?: boolean; label: string }) {
  const palette = usePalette();
  return (
    <View accessible accessibilityLabel={label} accessibilityState={{ busy: true }}>
      <View style={{ paddingHorizontal: 16, paddingTop: 6, paddingBottom: 14, gap: 12, borderBottomWidth: HAIRLINE, borderBottomColor: palette.hairline }}>
        {avatar ? <View style={{ width: 76, height: 76, borderRadius: 38, backgroundColor: palette.wash }} /> : null}
        <View style={{ gap: 8 }}>
          <Bar width="55%" height={26} />
          <Bar width="35%" height={15} />
        </View>
        <Bar width="70%" />
        <View style={{ height: 44, borderRadius: 22, backgroundColor: palette.wash }} />
      </View>
      <FeedSkeleton rows={2} />
    </View>
  );
}

// Skeletons match the rows they stand in for, so nothing jumps when posts arrive.
export function FeedSkeleton({ rows = 4 }: { rows?: number }) {
  const palette = usePalette();
  const widths: DimensionValue[][] = [["40%", "100%", "82%"], ["32%", "100%", "64%"], ["45%", "100%", "90%"], ["30%", "100%", "70%"]];
  return (
    <View accessible accessibilityLabel="Loading posts" accessibilityState={{ busy: true }}>
      {Array.from({ length: rows }, (_, index) => (
        <View key={index} style={{ flexDirection: "row", gap: 12, padding: 16, borderBottomWidth: HAIRLINE, borderBottomColor: palette.hairline }}>
          <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: palette.wash }} />
          <View style={{ flex: 1, gap: 9, paddingTop: 3 }}>
            {(widths[index % widths.length] ?? []).map((width, line) => (
              <View key={line} style={{ width, height: 12, borderRadius: 6, backgroundColor: palette.wash }} />
            ))}
          </View>
        </View>
      ))}
    </View>
  );
}
