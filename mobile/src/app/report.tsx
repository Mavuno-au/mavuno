import { router, useLocalSearchParams } from "expo-router";
import { Circle, CircleAlert, CircleCheck, X } from "lucide-react-native";
import { useState } from "react";
import { AccessibilityInfo, Keyboard, Pressable, ScrollView, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { z } from "zod";
import { LIMITS, REPORT_REASONS, type ReportReason } from "@/lib/catalogue";
import { siteLink } from "@/data/env";
import { reportContent } from "@/data/relations";
import { Button, IconButton } from "@/ui/controls";
import { KeyboardSheet } from "@/ui/form";
import { Header } from "@/ui/header";
import { font, Text, type } from "@/ui/text";
import { usePalette } from "@/ui/theme";
import { openLink } from "@/util/links";

// The website's report dialog (src/components/moderation/report-dialog.tsx)
// as a sheet. Opened with the kind and id of what is being reported.
const targetSchema = z.object({ type: z.enum(["post", "profile", "message", "event", "opportunity", "space"]), id: z.uuid() });

const ESAFETY_REPORT = "https://www.esafety.gov.au/report";

export default function ReportScreen() {
  const palette = usePalette();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ type?: string; id?: string }>();
  const target = targetSchema.safeParse(params).data;
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState("");
  const [contact, setContact] = useState("");
  const [sent, setSent] = useState<ReportReason | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const legal = reason === "legal";
  const what = target?.type ?? "post";

  async function submit() {
    if (!target || !reason || busy) return;
    Keyboard.dismiss();
    setBusy(true);
    const result = await reportContent({ targetType: target.type, targetId: target.id, reason, details, contact: legal ? contact : undefined });
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      AccessibilityInfo.announceForAccessibility(result.error);
      return;
    }
    setError(null);
    setSent(reason);
    AccessibilityInfo.announceForAccessibility("Report sent");
  }

  const close = (
    <IconButton label="Close" onPress={() => router.back()}>
      <X size={20} color={palette.ink} strokeWidth={2.2} />
    </IconButton>
  );
  const link = (label: string, href: string) => (
    <Text variant="subhead" tone="primary" accessibilityRole="link" style={{ fontFamily: font.medium }} onPress={() => openLink(href)}>
      {label}
    </Text>
  );

  if (!target) {
    return (
      <View style={{ flex: 1, backgroundColor: palette.surface }}>
        <Header title="Report" left={close} inset={false} />
        <Text variant="body" tone="muted" style={{ padding: 24 }}>
          There's nothing here to report.
        </Text>
      </View>
    );
  }

  if (sent) {
    return (
      <View style={{ flex: 1, backgroundColor: palette.surface }}>
        <Header title="Report sent" left={close} inset={false} />
        <View style={{ flex: 1, paddingHorizontal: 24, paddingTop: 12, paddingBottom: insets.bottom + 16, gap: 14 }}>
          <Text variant="body">Thanks. A moderator will review it. The person won't know who reported them.</Text>
          {sent === "legal" ? <Text variant="body">We'll look at your complaint and, where it's appropriate, act within 7 days. We'll contact you if we need more details.</Text> : null}
          {sent === "intimate_images" ? (
            <IntimateImagesNote />
          ) : (
            <Text variant="subhead" tone="muted">
              If this is serious online abuse and we haven't dealt with it within 48 hours, you can report it to {link("eSafety", ESAFETY_REPORT)}.
            </Text>
          )}
          <Text variant="subhead" tone="muted">
            If someone is in danger right now, call 000.
          </Text>
          <View style={{ flex: 1 }} />
          <Button label="Done" onPress={() => router.back()} />
        </View>
      </View>
    );
  }

  const canSend = reason !== null && !busy && (!legal || (details.trim() !== "" && contact.trim() !== ""));
  const field = [type.body, { fontSize: 17, lineHeight: 23, borderRadius: 12, borderWidth: 1, borderColor: palette.rail, paddingHorizontal: 14, paddingVertical: 12, color: palette.ink }];

  return (
    <KeyboardSheet style={{ flex: 1, backgroundColor: palette.surface }}>
      <Header title={`Report this ${what}`} left={close} inset={false} />
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: insets.bottom + 16, gap: 16 }}>
        <Text variant="subhead" tone="muted" style={{ paddingHorizontal: 8 }}>
          What's wrong? See the {link("community rules", siteLink("/rules"))}.
        </Text>
        <View accessibilityRole="radiogroup" style={{ gap: 2 }}>
          {REPORT_REASONS.map(({ value, label }) => {
            const checked = reason === value;
            return (
              <Pressable
                key={value}
                accessibilityRole="radio"
                accessibilityState={{ checked }}
                accessibilityLabel={label}
                onPress={() => setReason(value)}
                style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 12, minHeight: 46, paddingHorizontal: 8, borderRadius: 10, backgroundColor: pressed ? palette.wash : "transparent" })}
              >
                {checked ? <CircleCheck size={22} color={palette.primary} /> : <Circle size={22} color={palette.rail} />}
                <Text variant="callout" style={{ flex: 1 }}>
                  {label}
                </Text>
              </Pressable>
            );
          })}
        </View>
        {reason === "intimate_images" ? <IntimateImagesNote /> : null}
        <TextInput
          accessibilityLabel={legal ? "What's wrong with it" : "Anything else a moderator should know"}
          placeholder={legal ? "What's wrong with it and why, for example what is untrue and how it harms you (required)" : "Anything else a moderator should know (optional)"}
          placeholderTextColor={palette.inkMuted}
          multiline
          maxLength={LIMITS.reportDetails}
          value={details}
          onChangeText={setDetails}
          editable={!busy}
          style={[field, { minHeight: 96, textAlignVertical: "top" }]}
        />
        {legal ? (
          <View style={{ gap: 6 }}>
            <Text variant="label">How can we contact you?</Text>
            <TextInput
              accessibilityLabel="How can we contact you"
              placeholder="Your name and email or phone"
              placeholderTextColor={palette.inkMuted}
              maxLength={200}
              value={contact}
              onChangeText={setContact}
              editable={!busy}
              autoCapitalize="none"
              style={field}
            />
            <Text variant="subhead" tone="muted">
              Only moderators see this. We may tell the person who posted it about the complaint, but not how to reach you. For a longer complaint, email us as the{" "}
              {link("terms", siteLink("/terms#complaints"))} explain.
            </Text>
          </View>
        ) : null}
        {error ? (
          <View accessibilityRole="alert" style={{ flexDirection: "row", gap: 6, alignItems: "flex-start", paddingHorizontal: 8 }}>
            <CircleAlert size={16} color={palette.destructive} style={{ marginTop: 2 }} />
            <Text variant="subhead" tone="destructive" style={{ flex: 1 }}>
              {error}
            </Text>
          </View>
        ) : null}
        <Button label={busy ? "Sending…" : "Report"} busy={busy} disabled={!canSend} onPress={() => void submit()} />
      </ScrollView>
    </KeyboardSheet>
  );
}

// eSafety can act on intimate images straight away, without waiting for us.
function IntimateImagesNote() {
  const palette = usePalette();
  return (
    <View style={{ padding: 12, borderRadius: 12, backgroundColor: palette.wash }}>
      <Text variant="subhead">
        Report it to{" "}
        <Text variant="subhead" tone="primary" accessibilityRole="link" style={{ fontFamily: font.medium }} onPress={() => openLink(ESAFETY_REPORT)}>
          eSafety
        </Text>{" "}
        straight away as well. They can help get intimate images removed, here and on other sites, and you don't have to wait for us.
      </Text>
    </View>
  );
}
