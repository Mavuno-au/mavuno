import { useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, View } from "react-native";
import { z } from "zod";
import { calendarDate } from "@/lib/format";
import type { Notification } from "@/lib/notifications";
import { APPEAL_DAYS, appealDeadline, appealIsOpen, ruleOf } from "@/lib/rules";
import { CONTACT_EMAIL } from "@/lib/site";
import { siteLink } from "@/data/env";
import { loadModerationNotice } from "@/data/notifications";
import { Button, EmptyState } from "@/ui/controls";
import { BackButton, Header } from "@/ui/header";
import { font, Text } from "@/ui/text";
import { usePalette } from "@/ui/theme";
import { openLink } from "@/util/links";
import { timeZone } from "@/util/time";

// The website's appeal page (src/app/(app)/appeals/[id]): the decision and its
// rule, how to appeal, and what happens next, with one button.
export default function Appeal() {
  const palette = usePalette();
  const noticeId = z.coerce.number().int().positive().safeParse(useLocalSearchParams().id).data ?? null;
  const [loaded, setLoaded] = useState<{ id: number | null; notice: Notification | null | "loading" }>({ id: null, notice: "loading" });

  useEffect(() => {
    if (noticeId === null) return;
    let current = true;
    void loadModerationNotice(noticeId)
      .then((notice) => current && setLoaded({ id: noticeId, notice }))
      .catch(() => current && setLoaded({ id: noticeId, notice: null }));
    return () => {
      current = false;
    };
  }, [noticeId]);

  const notice = noticeId === null ? null : loaded.id === noticeId ? loaded.notice : "loading";
  const header = <Header title="Appeal a decision" left={<BackButton fallback="/notifications" />} />;
  if (notice === "loading") {
    return (
      <View style={{ flex: 1, backgroundColor: palette.surface }}>
        {header}
        <ActivityIndicator style={{ marginTop: 40 }} color={palette.inkMuted} accessibilityLabel="Loading" />
      </View>
    );
  }
  if (!notice?.notice) {
    return (
      <View style={{ flex: 1, backgroundColor: palette.surface }}>
        {header}
        <EmptyState title="We couldn't find that notice">It may belong to another account.</EmptyState>
      </View>
    );
  }

  const rule = ruleOf(notice.notice.rule);
  const deadline = appealDeadline(notice.createdAt);
  const open = appealIsOpen(notice.createdAt);
  const reference = notice.notice.decision === null ? `notice ${notice.id}` : `decision ${notice.notice.decision}`;
  const subject = `Appeal: ${reference}`;
  const body = `Link to the notice: ${siteLink(`/appeals/${notice.id}`)}\n\nWhy I think this was a mistake:\n\n`;
  const mailto = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  const heading = (text: string) => (
    <Text variant="heading" accessibilityRole="header" style={{ marginTop: 8 }}>
      {text}
    </Text>
  );

  return (
    <View style={{ flex: 1, backgroundColor: palette.surface }}>
      {header}
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
        <Text variant="meta" tone="muted">
          Notice of {calendarDate(notice.createdAt, timeZone)}
        </Text>
        <View style={{ padding: 14, borderRadius: 12, backgroundColor: palette.wash }}>
          <Text variant="callout">{notice.message}</Text>
        </View>
        <Text variant="callout">
          This decision was made under{" "}
          <Text variant="callout" tone="primary" accessibilityRole="link" onPress={() => openLink(siteLink(rule.href))}>
            {rule.label}
          </Text>
          . You can read the whole community rules and terms any time.
        </Text>
        {heading("How to appeal")}
        {open ? (
          <>
            <Text variant="callout">
              If you think we got it wrong, email us by <Text style={{ fontFamily: font.semibold }}>{calendarDate(deadline, timeZone)}</Text>, {APPEAL_DAYS} days after the notice. Tell us why you
              think it was a mistake, and include the link to this page so we can find the decision.
            </Text>
            <Button label="Email your appeal" onPress={() => openLink(mailto)} />
            <Text variant="subhead" tone="muted" selectable>
              Or write to {CONTACT_EMAIL} yourself, with "{subject}" as the subject.
            </Text>
          </>
        ) : (
          <Text variant="callout">
            The {APPEAL_DAYS} days to appeal this decision ended on {calendarDate(deadline, timeZone)}. If something stopped you appealing in time, email {CONTACT_EMAIL} and tell us what happened.
          </Text>
        )}
        {heading("What happens next")}
        <Text variant="callout">• A different moderator from the one who decided looks at it again.</Text>
        <Text variant="callout">• We aim to reply within 7 days.</Text>
        <Text variant="callout">• If we got it wrong, we restore what we removed or lift the suspension.</Text>
      </ScrollView>
    </View>
  );
}
