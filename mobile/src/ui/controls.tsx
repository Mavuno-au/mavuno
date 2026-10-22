import { CloudOff } from "lucide-react-native";
import type { ReactNode } from "react";
import { ActivityIndicator, Pressable, View, type DimensionValue, type PressableProps, type StyleProp, type ViewStyle } from "react-native";
import { PROBLEM, type Reason } from "@/data/errors";
import { font, Text } from "@/ui/text";
import { usePalette } from "@/ui/theme";

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
export function Segmented<Key extends string>({ label, options, value, onChange }: { label: string; options: readonly { key: Key; label: string }[]; value: Key; onChange: (key: Key) => void }) {
  const palette = usePalette();
  return (
    <View accessibilityRole="tablist" accessibilityLabel={label} style={{ flexDirection: "row", padding: 3, borderRadius: 22, backgroundColor: palette.wash, minHeight: 44 }}>
      {options.map((option) => {
        const selected = option.key === value;
        return (
          <Pressable
            key={option.key}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            onPress={() => onChange(option.key)}
            style={{
              flex: 1,
              minHeight: 38,
              paddingVertical: 6,
              paddingHorizontal: 8,
              borderRadius: 19,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: selected ? palette.popover : "transparent",
              shadowColor: "#000",
              shadowOpacity: selected ? 0.12 : 0,
              shadowRadius: 3,
              shadowOffset: { width: 0, height: 1 },
            }}
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

// Skeletons match the rows they stand in for, so nothing jumps when posts arrive.
export function FeedSkeleton({ rows = 4 }: { rows?: number }) {
  const palette = usePalette();
  const widths: DimensionValue[][] = [["40%", "100%", "82%"], ["32%", "100%", "64%"], ["45%", "100%", "90%"], ["30%", "100%", "70%"]];
  return (
    <View accessible accessibilityLabel="Loading posts" accessibilityState={{ busy: true }}>
      {Array.from({ length: rows }, (_, index) => (
        <View key={index} style={{ flexDirection: "row", gap: 12, padding: 16, borderBottomWidth: 1, borderBottomColor: palette.hairline }}>
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
