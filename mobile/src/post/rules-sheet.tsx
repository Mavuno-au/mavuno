import { useRef, useState } from "react";
import { Modal, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { RULE_LINES } from "@/lib/rules";
import { siteLink } from "@/data/env";
import { acceptRules } from "@/data/posts";
import { reloadViewer, useViewer } from "@/data/session";
import { Button } from "@/ui/controls";
import { FieldError } from "@/ui/form";
import { font, Text } from "@/ui/text";
import { usePalette } from "@/ui/theme";
import { openLink } from "@/util/links";

// The website's rules dialog (src/components/moderation/rules-dialog.tsx) as a
// sheet over the composer: shown once, before a member's first post, event or
// opportunity. The database refuses those until the rules are accepted.
export function useRulesGate() {
  const viewer = useViewer();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const answer = useRef<((accepted: boolean) => void) | null>(null);
  const [acceptedHere, setAcceptedHere] = useState(false);

  const ensure = () =>
    new Promise<boolean>((resolve) => {
      if (viewer?.rulesAccepted || acceptedHere) return resolve(true);
      answer.current = resolve;
      setError(null);
      setOpen(true);
    });

  const close = (accepted: boolean) => {
    setOpen(false);
    answer.current?.(accepted);
    answer.current = null;
  };

  async function accept() {
    setBusy(true);
    const result = await acceptRules();
    setBusy(false);
    if (!result.ok) return setError(result.error);
    setAcceptedHere(true);
    reloadViewer();
    close(true);
  }

  const sheet = <RulesSheet open={open} busy={busy} error={error} onAccept={() => void accept()} onClose={() => close(false)} />;
  return { ensure, sheet };
}

function RulesSheet({ open, busy, error, onAccept, onClose }: { open: boolean; busy: boolean; error: string | null; onAccept: () => void; onClose: () => void }) {
  const palette = usePalette();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={open} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: palette.surface }}>
        <ScrollView contentContainerStyle={{ padding: 24, gap: 16 }}>
          <Text variant="title" accessibilityRole="header">
            Before your first post
          </Text>
          <Text variant="callout" tone="muted">
            Mavuno works because people can trust what they read here. These are the five community rules. Breaking them can mean a removed post, a suspension or a ban.
          </Text>
          <View style={{ gap: 14 }}>
            {RULE_LINES.map((rule, index) => (
              <View key={rule.href} style={{ flexDirection: "row", gap: 12 }}>
                <Text variant="meta" tone="muted" style={{ width: 20 }}>
                  {index + 1}.
                </Text>
                <Text variant="callout" style={{ flex: 1 }}>
                  <Text variant="callout" accessibilityRole="link" onPress={() => openLink(siteLink(rule.href))} style={{ fontFamily: font.semibold }}>
                    {rule.title}.
                  </Text>{" "}
                  {rule.line}
                </Text>
              </View>
            ))}
          </View>
          {error ? <FieldError>{error}</FieldError> : null}
        </ScrollView>
        <View style={{ gap: 10, paddingHorizontal: 24, paddingTop: 12, paddingBottom: insets.bottom + 16, borderTopWidth: 1, borderTopColor: palette.hairline }}>
          <Button label="I've read them and I agree" busy={busy} onPress={onAccept} />
          <Button label="Not now" variant="plain" onPress={onClose} disabled={busy} />
        </View>
      </View>
    </Modal>
  );
}
