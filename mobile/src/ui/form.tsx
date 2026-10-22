import { ChevronRight, CircleAlert, Eye, EyeOff } from "lucide-react-native";
import { useEffect, useRef, useState, type ComponentRef, type ReactNode, type Ref } from "react";
import { AccessibilityInfo, ActivityIndicator, Pressable, Switch, TextInput, View, type ScrollView, type TextInputProps } from "react-native";
import { ActionSheet } from "@/ui/sheet";
import { font, Text, type } from "@/ui/text";
import { usePalette } from "@/ui/theme";

// Labels sit above fields, so they don't vanish while typing, and every field
// is at least 44 points tall and 16-point text, so iOS never zooms.

type FieldProps = Omit<TextInputProps, "style"> & {
  label: string;
  hint?: string;
  error?: string | null;
  limit?: number;
  mono?: boolean;
  hideLabel?: boolean;
  ref?: Ref<ComponentRef<typeof TextInput>>;
  trailing?: ReactNode;
};

export function TextField({ label, hint, error, limit, mono = false, hideLabel = false, multiline, value, ref, trailing, ...props }: FieldProps) {
  const palette = usePalette();
  const [focused, setFocused] = useState(false);
  const left = limit !== undefined && value !== undefined ? limit - value.length : null;
  return (
    <View style={{ gap: 6 }}>
      {hideLabel ? null : (
        <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
          <Text variant="label" style={{ fontSize: 14 }}>
            {label}
          </Text>
          {left !== null && left < Math.min(100, (limit ?? 0) / 4) ? (
            <Text variant="caption" tone={left < 0 ? "destructive" : "muted"}>
              {left}
            </Text>
          ) : null}
        </View>
      )}
      <View
        style={{
          flexDirection: "row",
          alignItems: multiline ? "stretch" : "center",
          borderRadius: 12,
          borderWidth: focused ? 2 : 1,
          borderColor: error ? palette.destructive : focused ? palette.primary : palette.rail,
          backgroundColor: palette.surface,
          paddingRight: trailing ? 3 : 0,
        }}
      >
        <TextInput
          ref={ref}
          {...props}
          value={value}
          multiline={multiline}
          accessibilityLabel={label}
          accessibilityHint={hint}
          placeholderTextColor={palette.inkMuted}
          onFocus={(event) => {
            setFocused(true);
            props.onFocus?.(event);
          }}
          onBlur={(event) => {
            setFocused(false);
            props.onBlur?.(event);
          }}
          style={[
            mono ? type.meta : type.body,
            {
              flex: 1,
              fontSize: 16,
              lineHeight: multiline ? 22 : undefined,
              // The border thickens on focus; the inner height makes up for it so nothing below moves.
              minHeight: (multiline ? 96 : 48) - (focused ? 4 : 2),
              paddingHorizontal: focused ? 13 : 14,
              paddingTop: multiline ? 12 : 0,
              paddingBottom: multiline ? 12 : 0,
              color: palette.ink,
              textAlignVertical: multiline ? "top" : "center",
            },
          ]}
        />
        {trailing}
      </View>
      {hint && !error ? (
        <Text variant="small" tone="muted">
          {hint}
        </Text>
      ) : null}
      {error ? <FieldError>{error}</FieldError> : null}
    </View>
  );
}

// A password with Show and Hide, as on the sign-in screen, so people can check
// what they typed on a phone keyboard.
export function PasswordField(props: Omit<FieldProps, "secureTextEntry" | "trailing">) {
  const palette = usePalette();
  const [shown, setShown] = useState(false);
  return (
    <TextField
      {...props}
      secureTextEntry={!shown}
      autoCapitalize="none"
      autoCorrect={false}
      trailing={
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={shown ? "Hide password" : "Show password"}
          onPress={() => setShown((value) => !value)}
          style={{ width: 44, alignSelf: "stretch", alignItems: "center", justifyContent: "center" }}
        >
          {shown ? <EyeOff size={20} color={palette.inkMuted} /> : <Eye size={20} color={palette.inkMuted} />}
        </Pressable>
      }
    />
  );
}

// A sheet's error sits above its fields and Save is in the header, so the
// form scrolls back up to show it, and VoiceOver reads it out.
export function useErrorScroll(error: string | null) {
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  useEffect(() => {
    if (!error) return;
    scroll.current?.scrollTo({ y: 0, animated: true });
    AccessibilityInfo.announceForAccessibility(error);
  }, [error]);
  return scroll;
}

// Red with an icon, so it doesn't rely on colour alone.
export function FieldError({ children }: { children: ReactNode }) {
  const palette = usePalette();
  return (
    <View accessibilityRole="alert" style={{ flexDirection: "row", alignItems: "flex-start", gap: 6 }}>
      <CircleAlert size={16} color={palette.destructive} style={{ marginTop: 1 }} />
      <Text variant="small" tone="destructive" style={{ flex: 1 }}>
        {children}
      </Text>
    </View>
  );
}

// A grouped list on sand, as iOS settings are.
export function Group({ title, footer, children }: { title?: string; footer?: ReactNode; children: ReactNode }) {
  const palette = usePalette();
  return (
    <View style={{ gap: 6 }}>
      {title ? (
        <Text variant="small" tone="muted" accessibilityRole="header" style={{ fontFamily: font.semibold, paddingHorizontal: 16, textTransform: "uppercase", letterSpacing: 0.5 }}>
          {title}
        </Text>
      ) : null}
      <View style={{ borderRadius: 14, backgroundColor: palette.surface, overflow: "hidden", borderWidth: palette.dark ? 1 : 0, borderColor: palette.hairline }}>{children}</View>
      {footer ? (
        <Text variant="small" tone="muted" style={{ paddingHorizontal: 16 }}>
          {footer}
        </Text>
      ) : null}
    </View>
  );
}

export function Row({
  label,
  value,
  icon,
  onPress,
  tone = "ink",
  last = false,
  busy = false,
  accessory,
}: {
  label: string;
  value?: string;
  icon?: ReactNode;
  onPress?: () => void;
  tone?: "ink" | "destructive" | "primary";
  last?: boolean;
  busy?: boolean;
  accessory?: ReactNode;
}) {
  const palette = usePalette();
  return (
    <Pressable
      accessibilityRole={onPress ? "button" : undefined}
      accessibilityLabel={value ? `${label}, ${value}` : label}
      disabled={!onPress || busy}
      onPress={onPress}
      style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 12, minHeight: 52, paddingLeft: 16, backgroundColor: pressed ? palette.wash : "transparent" })}
    >
      {icon}
      <View style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 8, minHeight: 52, paddingVertical: 10, paddingRight: 14, borderBottomWidth: last ? 0 : 1, borderBottomColor: palette.hairline }}>
        <Text variant="body" tone={tone} style={{ flex: 1 }}>
          {label}
        </Text>
        {value ? (
          <Text variant="callout" tone="muted" numberOfLines={1} style={{ maxWidth: "55%", textAlign: "right" }}>
            {value}
          </Text>
        ) : null}
        {busy ? <ActivityIndicator color={palette.inkMuted} /> : (accessory ?? (onPress && tone === "ink" ? <ChevronRight size={18} color={palette.rail} /> : null))}
      </View>
    </Pressable>
  );
}

export function ToggleRow({ label, hint, value, onChange, last = false, disabled = false }: { label: string; hint?: string; value: boolean; onChange: (value: boolean) => void; last?: boolean; disabled?: boolean }) {
  const palette = usePalette();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 12, minHeight: 52, paddingLeft: 16 }}>
      <View style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 12, minHeight: 52, paddingVertical: 10, paddingRight: 14, borderBottomWidth: last ? 0 : 1, borderBottomColor: palette.hairline }}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="body">{label}</Text>
          {hint ? (
            <Text variant="small" tone="muted">
              {hint}
            </Text>
          ) : null}
        </View>
        <Switch accessibilityLabel={label} value={value} onValueChange={onChange} disabled={disabled} trackColor={{ true: palette.primary, false: palette.rail }} />
      </View>
    </View>
  );
}

// A choice from a list, as a native-feeling menu from the bottom.
export function SelectRow<Value extends string | number>({
  label,
  options,
  value,
  onChange,
  last = false,
  placeholder = "Choose",
}: {
  label: string;
  options: readonly { value: Value; label: string }[];
  value: Value | null;
  onChange: (value: Value) => void;
  last?: boolean;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const chosen = options.find((option) => option.value === value);
  return (
    <>
      <Row label={label} value={chosen?.label ?? placeholder} onPress={() => setOpen(true)} last={last} />
      <ActionSheet title={label} actions={options.map((option) => ({ label: option.label, checked: option.value === value, onPress: () => onChange(option.value) }))} open={open} onClose={() => setOpen(false)} />
    </>
  );
}

// Tappable chips for one or several choices, such as interests or a type.
export function ChipPicker<Value extends string>({
  label,
  options,
  selected,
  onToggle,
  max,
}: {
  label: string;
  options: readonly { value: Value; label: string }[];
  selected: readonly Value[];
  onToggle: (value: Value) => void;
  max?: number;
}) {
  const palette = usePalette();
  const full = max !== undefined && selected.length >= max;
  return (
    <View style={{ gap: 8 }}>
      <Text variant="label" style={{ fontSize: 14 }}>
        {label}
        {max ? (
          <Text variant="small" tone="muted">
            {"  "}
            {selected.length} of {max}
          </Text>
        ) : null}
      </Text>
      <View accessibilityRole="list" style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {options.map((option) => {
          const on = selected.includes(option.value);
          return (
            <Pressable
              key={option.value}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: on, disabled: !on && full }}
              disabled={!on && full}
              onPress={() => onToggle(option.value)}
              style={({ pressed }) => ({
                minHeight: 38,
                justifyContent: "center",
                paddingHorizontal: 14,
                borderRadius: 19,
                borderWidth: 1,
                borderColor: on ? palette.primary : palette.rail,
                backgroundColor: on ? palette.primarySoft : pressed ? palette.wash : palette.surface,
                opacity: !on && full ? 0.5 : 1,
              })}
            >
              <Text variant="subhead" tone={on ? "primary" : "ink"} style={{ fontFamily: on ? font.semibold : font.regular }}>
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

// Cancel on the left, the title, and the one action on the right, as Apple's sheet guidance asks.
export function SheetHeader({ title, onCancel, action, cancelLabel = "Cancel" }: { title: string; onCancel: () => void; action?: { label: string; onPress: () => void; disabled?: boolean; busy?: boolean; hint?: string }; cancelLabel?: string }) {
  const palette = usePalette();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 8, backgroundColor: palette.surface }}>
      <Pressable
        accessibilityRole="button"
        onPress={onCancel}
        style={({ pressed }) => ({ minHeight: 44, minWidth: 72, paddingHorizontal: 16, borderRadius: 22, borderWidth: 1, borderColor: palette.hairline, alignItems: "center", justifyContent: "center", backgroundColor: pressed ? palette.wash : palette.popover })}
      >
        <Text variant="callout" style={{ fontFamily: font.medium }} maxFontSizeMultiplier={1.6}>
          {cancelLabel}
        </Text>
      </Pressable>
      <Text variant="headline" accessibilityRole="header" numberOfLines={1} maxFontSizeMultiplier={1.6} style={{ flexShrink: 1 }}>
        {title}
      </Text>
      {action ? (
        <Pressable
          accessibilityRole="button"
          accessibilityHint={action.hint}
          accessibilityState={{ disabled: action.disabled || action.busy, busy: action.busy }}
          disabled={action.disabled || action.busy}
          onPress={action.onPress}
          style={({ pressed }) => ({
            minHeight: 44,
            minWidth: 72,
            paddingHorizontal: 20,
            borderRadius: 22,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: palette.primary,
            opacity: action.disabled ? 0.45 : pressed ? 0.8 : 1,
          })}
        >
          {action.busy ? (
            <ActivityIndicator color={palette.primaryInk} />
          ) : (
            <Text variant="callout" tone="primaryInk" style={{ fontFamily: font.semibold }} maxFontSizeMultiplier={1.6}>
              {action.label}
            </Text>
          )}
        </Pressable>
      ) : (
        <View style={{ minWidth: 72 }} />
      )}
    </View>
  );
}
