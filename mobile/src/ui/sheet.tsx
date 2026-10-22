import { Check } from "lucide-react-native";
import { useRef, type ReactNode } from "react";
import { Modal, Platform, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { font, Text } from "@/ui/text";
import { usePalette } from "@/ui/theme";

export type SheetAction = { label: string; icon?: ReactNode; destructive?: boolean; checked?: boolean; onPress: () => void };

// The actions behind a More button, as a sheet from the bottom. An action runs
// once the sheet is gone, so an alert it opens isn't under a closing modal.
export function ActionSheet({ title, actions, open, onClose, cancelLabel = "Cancel" }: { title?: string; actions: SheetAction[]; open: boolean; onClose: () => void; cancelLabel?: string }) {
  const palette = usePalette();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const pending = useRef<(() => void) | null>(null);

  const runPending = () => {
    const action = pending.current;
    pending.current = null;
    action?.();
  };
  const choose = (action: SheetAction) => {
    pending.current = action.onPress;
    onClose();
    // Android has no onDismiss; its modal is gone by the next frame.
    if (Platform.OS !== "ios") runPending();
  };

  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose} onDismiss={runPending}>
      <View style={{ flex: 1, justifyContent: "flex-end" }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(0, 0, 0, 0.35)" }]} />
        <View style={{ backgroundColor: palette.popover, borderTopLeftRadius: 18, borderTopRightRadius: 18, paddingTop: 8, paddingBottom: insets.bottom + 8, paddingHorizontal: 8 }}>
          <View style={{ alignSelf: "center", width: 36, height: 5, borderRadius: 3, backgroundColor: palette.rail, marginBottom: 6 }} />
          {title ? (
            <Text variant="subhead" tone="muted" numberOfLines={1} style={{ textAlign: "center", paddingHorizontal: 16, paddingVertical: 8 }}>
              {title}
            </Text>
          ) : null}
          {/* A long list, such as every language, scrolls inside the sheet. */}
          <ScrollView style={{ maxHeight: height * 0.62 }} bounces={false}>
          {actions.map((action) => (
            <Pressable
              key={action.label}
              accessibilityRole="button"
              accessibilityLabel={action.label}
              accessibilityState={action.checked === undefined ? undefined : { selected: action.checked }}
              onPress={() => choose(action)}
              style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 14, minHeight: 52, paddingHorizontal: 16, borderRadius: 12, backgroundColor: pressed ? palette.wash : "transparent" })}
            >
              {action.icon}
              <Text variant="body" tone={action.destructive ? "destructive" : "ink"} style={{ flex: 1 }}>
                {action.label}
              </Text>
              {action.checked ? <Check size={20} color={palette.primary} /> : null}
            </Pressable>
          ))}
          </ScrollView>
          <Pressable
            accessibilityRole="button"
            onPress={onClose}
            style={({ pressed }) => ({ minHeight: 52, marginTop: 6, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: pressed ? palette.hairline : palette.wash })}
          >
            <Text variant="headline" style={{ fontFamily: font.semibold }}>
              {cancelLabel}
            </Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}
