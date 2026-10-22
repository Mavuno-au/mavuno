import type { ReactNode } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { ProfileCard } from "@/lib/domain";
import { Avatar } from "@/ui/avatar";
import { BackButton } from "@/ui/header";
import { Text } from "@/ui/text";
import { usePalette } from "@/ui/theme";

// The join screens' shared frame: Back (or what replaces it), a step bar, the title, and the
// person who invited you, so people remember why they're here.
export function JoinFrame({ top, step, steps = 2, title, intro, inviter, children, footer }: { top?: ReactNode; step?: number; steps?: number; title: string; intro?: string; inviter?: ProfileCard | null; children: ReactNode; footer?: ReactNode }) {
  const palette = usePalette();
  const insets = useSafeAreaInsets();
  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1, paddingTop: insets.top, backgroundColor: palette.surface }}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ flexGrow: 1, paddingBottom: insets.bottom + 16 }}>
        <View style={{ minHeight: 52, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>{top ?? <BackButton fallback="/welcome" />}</View>
        <View style={{ flex: 1, paddingHorizontal: 24, paddingTop: 8, gap: 20 }}>
          {step ? (
            <View style={{ gap: 8 }}>
              <View accessible accessibilityLabel={`Step ${step} of ${steps}`} style={{ flexDirection: "row", gap: 6 }}>
                {Array.from({ length: steps }, (_, index) => (
                  <View key={index} style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: index < step ? palette.primary : palette.hairline }} />
                ))}
              </View>
              <Text variant="caption" tone="muted">
                Step {step} of {steps}
              </Text>
            </View>
          ) : null}
          {inviter ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10, padding: 12, borderRadius: 14, backgroundColor: palette.primarySoft }}>
              <Avatar person={inviter} size={36} />
              <Text variant="callout" style={{ flex: 1 }}>
                {inviter.displayName} invited you. You'll follow each other once you join.
              </Text>
            </View>
          ) : null}
          <View style={{ gap: 8 }}>
            <Text variant="largeTitle" accessibilityRole="header">
              {title}
            </Text>
            {intro ? (
              <Text variant="callout" tone="muted">
                {intro}
              </Text>
            ) : null}
          </View>
          {children}
        </View>
        {footer ? <View style={{ paddingHorizontal: 24, paddingTop: 24, gap: 10 }}>{footer}</View> : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
