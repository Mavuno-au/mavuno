import { router, useLocalSearchParams } from "expo-router";
import { BadgeCheck, Bookmark, BookmarkCheck, Ellipsis, ShieldCheck } from "lucide-react-native";
import { useCallback, useEffect, useState } from "react";
import { Alert, Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { OPPORTUNITY_TYPES } from "@/lib/catalogue";
import { DEADLINE_ZONE, opportunityPlace, type Opportunity } from "@/lib/community";
import { relativeTime } from "@/lib/format";
import { siteLink } from "@/data/env";
import { reasonOf, type Reason } from "@/data/errors";
import { closeOpportunity, loadOpportunity, setOpportunitySaved } from "@/data/community";
import { useViewer } from "@/data/session";
import { RichText } from "@/post/rich-text";
import { Avatar } from "@/ui/avatar";
import { Button, Chip, EmptyState, FeedSkeleton, IconButton, LoadFailed } from "@/ui/controls";
import { BackButton, Header } from "@/ui/header";
import { ActionSheet, type SheetAction } from "@/ui/sheet";
import { font, Text } from "@/ui/text";
import { HAIRLINE, usePalette } from "@/ui/theme";
import { toast, useToastFloor } from "@/ui/toast";
import { openLink, shareLink } from "@/util/links";
import { timeZone, useNow } from "@/util/time";

type State = { kind: "missing" } | { kind: "failed"; reason: Reason } | { kind: "ready"; opportunity: Opportunity; saved: boolean };

// The website's opportunity: its details in a small table, with Apply and
// Save pinned at the bottom. A closed one says so and hides Apply.
export default function OpportunityScreen() {
  const palette = usePalette();
  const insets = useSafeAreaInsets();
  const viewer = useViewer();
  const opportunityId = String(useLocalSearchParams().id ?? "");
  const [loaded, setLoaded] = useState<{ id: string; state: State } | null>(null);
  const [menu, setMenu] = useState(false);
  // Saved and Removed toasts show above Apply and Save.
  const barFloor = useToastFloor();
  const viewerId = viewer?.id ?? null;
  const now = useNow();

  const read = useCallback(() => {
    if (!viewerId) return;
    void loadOpportunity(opportunityId, viewerId)
      .then((found) => setLoaded({ id: opportunityId, state: found ? { kind: "ready", ...found } : { kind: "missing" } }))
      .catch((error: unknown) => setLoaded({ id: opportunityId, state: { kind: "failed", reason: reasonOf(error) } }));
  }, [opportunityId, viewerId]);

  useEffect(read, [read]);

  const state = loaded?.id === opportunityId ? loaded.state : undefined;
  if (state?.kind !== "ready" || !viewer) {
    return (
      <View style={{ flex: 1, backgroundColor: palette.surface }}>
        <Header title="Opportunity" left={<BackButton fallback="/opportunities" />} />
        {state === undefined ? <FeedSkeleton rows={2} /> : null}
        {state?.kind === "missing" ? <EmptyState title="We couldn't find that opportunity">It may have been removed.</EmptyState> : null}
        {state?.kind === "failed" ? <LoadFailed title="This opportunity didn't load" reason={state.reason} onRetry={read} /> : null}
      </View>
    );
  }

  const { opportunity, saved } = state;
  const owner = viewer.id === opportunity.posterId || viewer.organisations.some((organisation) => organisation.id === opportunity.posterId && organisation.role !== "editor");
  const email = opportunity.applyEmail ? `mailto:${opportunity.applyEmail}?subject=${encodeURIComponent(opportunity.title)}` : null;
  const rows: [string, string][] = [
    ["Type", OPPORTUNITY_TYPES[opportunity.type].label],
    ["Where", opportunityPlace(opportunity)],
    ...(opportunity.compensation ? [["Pay or value", opportunity.compensation] satisfies [string, string]] : []),
    ["Deadline", opportunity.deadlineAt ? new Date(opportunity.deadlineAt).toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric", timeZone: DEADLINE_ZONE }) : "None"],
    ["Posted by", opportunity.organisation ?? opportunity.poster.displayName],
  ];

  async function toggleSaved() {
    if (!viewer) return;
    const result = await setOpportunitySaved(viewer.id, opportunity.id, !saved);
    if (!result.ok) return Alert.alert("Couldn't save it", result.error);
    toast(saved ? "Removed from saved" : "Saved");
    read();
  }

  const actions: SheetAction[] = [
    { label: "Share", onPress: () => shareLink(siteLink(`/opportunities/${opportunity.id}`)) },
    ...(opportunity.review.kind === "published" && !opportunity.closed ? [{ label: "Write a post about it", onPress: () => router.push({ pathname: "/compose", params: { opportunity: opportunity.id, placeholder: "Say a few words about it" } }) }] : []),
    ...(owner
      ? [
          { label: "Edit", onPress: () => router.push({ pathname: "/opportunity-form", params: { id: opportunity.id } }) },
          ...(opportunity.closed
            ? []
            : [
                {
                  label: "Close it",
                  destructive: true,
                  onPress: () =>
                    Alert.alert("Close this opportunity?", "It stops showing in Opportunities. You can't undo this.", [
                      { text: "Keep it open", style: "cancel" },
                      {
                        text: "Close it",
                        style: "destructive",
                        onPress: () =>
                          void closeOpportunity(opportunity.id).then((result) => {
                            if (!result.ok) return Alert.alert("Couldn't close it", result.error);
                            toast("Opportunity closed");
                            read();
                          }),
                      },
                    ]),
                },
              ]),
        ]
      : [{ label: "Report", destructive: true, onPress: () => router.push({ pathname: "/report", params: { type: "opportunity", id: opportunity.id } }) }]),
  ];

  return (
    <View style={{ flex: 1, backgroundColor: palette.surface }}>
      <Header
        title="Opportunity"
        left={<BackButton fallback="/opportunities" />}
        right={
          <IconButton label="Options" onPress={() => setMenu(true)}>
            <Ellipsis size={19} color={palette.ink} />
          </IconButton>
        }
      />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 120 }}>
        {opportunity.review.kind === "pending" ? <Chip tone="warning">Waiting for review. Only you can see it until a moderator approves it.</Chip> : null}
        {opportunity.review.kind === "rejected" ? <Chip tone="danger">Not approved{opportunity.review.reason ? `: ${opportunity.review.reason}` : ""}</Chip> : null}
        <Chip tone="primary">{OPPORTUNITY_TYPES[opportunity.type].label}</Chip>
        <Text variant="title" accessibilityRole="header">
          {opportunity.title}
        </Text>
        <Pressable accessibilityRole="link" onPress={() => router.push(`/profile/${opportunity.poster.username}`)} style={{ flexDirection: "row", alignItems: "center", gap: 10, minHeight: 44 }}>
          <Avatar person={opportunity.poster} size={32} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
              <Text variant="callout" numberOfLines={1} style={{ flexShrink: 1, fontFamily: font.semibold }}>
                {opportunity.poster.displayName}
              </Text>
              {opportunity.poster.verified ? (
                <View accessible accessibilityLabel="Verified organisation">
                  <BadgeCheck size={16} color={palette.primary} />
                </View>
              ) : null}
            </View>
            <Text variant="meta" tone="muted" numberOfLines={1}>
              @{opportunity.poster.username} · Posted {relativeTime(opportunity.createdAt, now, timeZone)}
            </Text>
          </View>
        </Pressable>
        {opportunity.closed ? (
          <View accessibilityRole="alert" style={{ padding: 12, borderRadius: 10, backgroundColor: palette.wash }}>
            <Text variant="callout">This opportunity has closed.</Text>
          </View>
        ) : null}
        <View style={{ borderRadius: 12, borderWidth: 1, borderColor: palette.hairline }}>
          {rows.map(([label, value], index) => (
            <View key={label} style={{ flexDirection: "row", gap: 12, paddingHorizontal: 14, paddingVertical: 12, borderTopWidth: index === 0 ? 0 : HAIRLINE, borderTopColor: palette.hairline }}>
              <Text variant="subhead" tone="muted" style={{ width: 110 }}>
                {label}
              </Text>
              <Text variant="subhead" style={{ flex: 1, fontFamily: font.medium }}>
                {value}
              </Text>
            </View>
          ))}
        </View>
        <RichText body={opportunity.description} variant="callout" />
        <View style={{ flexDirection: "row", gap: 10, paddingTop: 4 }}>
          <ShieldCheck size={16} color={palette.inkMuted} style={{ marginTop: 2 }} />
          <Text variant="subhead" tone="muted" style={{ flex: 1 }}>
            Stay safe: never pay to apply, and don't share bank or ID details until you've checked who you're dealing with. If something seems off, report it.
          </Text>
        </View>
        {opportunity.closed ? <Button label="See open opportunities" variant="outline" onPress={() => router.push("/opportunities")} /> : null}
      </ScrollView>
      {opportunity.closed ? null : (
        <View {...barFloor} style={{ position: "absolute", left: 0, right: 0, bottom: 0, flexDirection: "row", gap: 10, paddingHorizontal: 16, paddingTop: 10, paddingBottom: Math.max(insets.bottom, 10), borderTopWidth: HAIRLINE, borderTopColor: palette.hairline, backgroundColor: palette.surface }}>
          {opportunity.applyUrl ? <Button label="Apply" onPress={() => opportunity.applyUrl && openLink(opportunity.applyUrl)} style={{ flex: 1 }} /> : null}
          {email ? <Button label={opportunity.applyUrl ? "Email" : "Apply by email"} variant={opportunity.applyUrl ? "outline" : "primary"} hint="Writes to them by email" onPress={() => openLink(email)} style={opportunity.applyUrl ? undefined : { flex: 1 }} /> : null}
          <Button
            label={saved ? "Saved" : "Save"}
            variant="outline"
            icon={saved ? <BookmarkCheck size={18} color={palette.primary} /> : <Bookmark size={18} color={palette.ink} />}
            onPress={() => void toggleSaved()}
          />
        </View>
      )}
      <ActionSheet title={opportunity.title} actions={actions} open={menu} onClose={() => setMenu(false)} />
    </View>
  );
}
