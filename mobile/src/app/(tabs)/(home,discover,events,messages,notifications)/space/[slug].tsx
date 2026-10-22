import { Image } from "expo-image";
import { router, useLocalSearchParams } from "expo-router";
import { BadgeCheck, Check, Ellipsis } from "lucide-react-native";
import { useCallback, useEffect, useState } from "react";
import { Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { CommunityEvent, Space, SpaceRole } from "@/lib/community";
import { compact } from "@/lib/format";
import { loadSpace, loadUpcomingEvents, setMembership } from "@/data/community";
import { reasonOf, type Reason } from "@/data/errors";
import { useViewer } from "@/data/session";
import { useFeed } from "@/data/use-feed";
import { loadFeed } from "@/data/posts";
import { EventRow } from "@/community/event-row";
import { Avatar } from "@/ui/avatar";
import { FeedList } from "@/post/feed-list";
import { Button, EmptyState, IconButton, LoadFailed, PageSkeleton } from "@/ui/controls";
import { BackButton, Header } from "@/ui/header";
import { ActionSheet } from "@/ui/sheet";
import { font, Text } from "@/ui/text";
import { HAIRLINE, usePalette } from "@/ui/theme";
import { toast } from "@/ui/toast";
import { haptics } from "@/util/haptics";
import { openLink, shareLink } from "@/util/links";
import { siteLink } from "@/data/env";

const PHOTO_HEIGHT = 224;

type State = { kind: "missing" } | { kind: "failed"; reason: Reason } | { kind: "ready"; space: Space; role: SpaceRole | null; events: CommunityEvent[] };

// A city or interest space: the city's photo with its credit and licence,
// Join, the next events, and the space's posts.
export default function SpaceScreen() {
  const palette = usePalette();
  const viewer = useViewer();
  const insets = useSafeAreaInsets();
  const slug = String(useLocalSearchParams().slug ?? "");
  const [loaded, setLoaded] = useState<{ slug: string; state: State } | null>(null);
  const [busy, setBusy] = useState(false);
  const [menu, setMenu] = useState(false);
  const viewerId = viewer?.id ?? null;

  const read = useCallback(() => {
    if (!viewerId) return;
    void loadSpace(slug, viewerId)
      .then(async (found) => {
        if (!found) return setLoaded({ slug, state: { kind: "missing" } });
        const events = await loadUpcomingEvents({ kind: "space", spaceId: found.space.id }, null, 3).catch(() => []);
        setLoaded({ slug, state: { kind: "ready", ...found, events } });
      })
      .catch((error: unknown) => setLoaded({ slug, state: { kind: "failed", reason: reasonOf(error) } }));
  }, [slug, viewerId]);

  useEffect(read, [read]);

  const state = loaded?.slug === slug ? loaded.state : undefined;
  const space = state?.kind === "ready" ? state.space : null;
  const feed = useFeed((cursor) => loadFeed({ kind: "space", spaceId: space?.id ?? "" }, cursor), `space:${space?.id ?? ""}`, { enabled: space !== null, takesPosts: true });

  if (state?.kind !== "ready" || !space) {
    return (
      <View style={{ flex: 1, backgroundColor: palette.surface }}>
        <Header left={<BackButton fallback="/spaces" />} />
        {state === undefined ? <PageSkeleton label="Loading space" /> : null}
        {state?.kind === "missing" ? <EmptyState title="We couldn't find that space">It may have been renamed or removed.</EmptyState> : null}
        {state?.kind === "failed" ? <LoadFailed title="This space didn't load" reason={state.reason} onRetry={read} /> : null}
      </View>
    );
  }

  const joined = state.role !== null;
  async function set(next: boolean) {
    if (!viewerId || !space) return;
    setBusy(true);
    const result = await setMembership(viewerId, space.id, next);
    setBusy(false);
    if (!result.ok) return toast(`${next ? "Couldn't join" : "Couldn't leave"}. ${result.error}`, { tone: "error" });
    haptics.confirm();
    // Joining again makes a member, so a moderator or owner gets no Undo: it
    // wouldn't give back what they left.
    const undo = !next && state?.kind === "ready" && state.role === "member";
    toast(next ? `Joined ${space.name}` : `Left ${space.name}`, undo ? { action: { label: "Undo", onPress: () => void set(true) } } : {});
    read();
  }
  const write = () => router.push({ pathname: "/compose", params: { space: space.id, placeholder: `Write something for ${space.name}` } });
  const counts = `${compact(space.members)} ${space.members === 1 ? "member" : "members"} · ${compact(space.posts)} ${space.posts === 1 ? "post" : "posts"}`;
  const options = (
    <IconButton label="Space options" onPress={() => setMenu(true)}>
      <Ellipsis size={19} color={palette.ink} />
    </IconButton>
  );

  // The iPhone design's space: the city's photo edge to edge with its credit
  // on it, then the name with Join beside it, the description, and a field
  // that starts a post here.
  const header = (
    <View style={{ borderBottomWidth: HAIRLINE, borderBottomColor: palette.hairline }}>
      {space.photo ? (
        <View style={{ height: PHOTO_HEIGHT, backgroundColor: palette.wash }}>
          <Image source={space.photo.url} style={{ flex: 1 }} contentFit="cover" contentPosition={{ top: "40%" }} accessibilityLabel={`${space.name}`} />
          <Text
            variant="caption"
            accessibilityRole="link"
            accessibilityHint="Opens where the photo comes from"
            onPress={() => space.photo && openLink(space.photo.sourceUrl)}
            style={{ position: "absolute", right: 10, bottom: 10, overflow: "hidden", borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, color: "#ffffff", backgroundColor: "rgba(0, 0, 0, 0.66)" }}
          >
            Photo: {space.photo.author}, {space.photo.license}
          </Text>
        </View>
      ) : null}
      <View style={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 14, gap: 12 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Text variant="title" accessibilityRole="header" style={{ flexShrink: 1 }}>
                {space.emoji && !space.photo ? `${space.emoji} ` : ""}
                {space.name}
              </Text>
              {space.official ? (
                <View accessible accessibilityLabel="Official space">
                  <BadgeCheck size={20} color={palette.primary} />
                </View>
              ) : null}
            </View>
            <Text variant="meta" tone="muted">
              {counts}
            </Text>
          </View>
          <Button
            label={joined ? "Joined" : "Join"}
            hint={joined ? "Leaves this space" : undefined}
            variant={joined ? "outline" : "primary"}
            size="medium"
            busy={busy}
            icon={joined ? <Check size={16} color={palette.ink} strokeWidth={2.4} /> : undefined}
            onPress={() => void set(!joined)}
            style={{ minWidth: 104 }}
          />
        </View>
        {space.description ? <Text variant="body">{space.description}</Text> : null}
        {joined && viewer ? (
          <Pressable accessibilityRole="button" accessibilityLabel={`Post in ${space.name}`} onPress={write} style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <Avatar person={viewer} size={32} />
            <View style={{ flex: 1, minHeight: 44, justifyContent: "center", paddingHorizontal: 16, borderRadius: 22, borderWidth: 1, borderColor: palette.rail }}>
              <Text variant="body" tone="muted" numberOfLines={1}>
                Post in {space.name}
              </Text>
            </View>
          </Pressable>
        ) : null}
      </View>
      {state.events.length > 0 ? (
        <View>
          <Text variant="small" tone="muted" accessibilityRole="header" style={{ fontFamily: font.semibold, paddingHorizontal: 16, paddingBottom: 4 }}>
            Coming up
          </Text>
          {state.events.map((event) => (
            <EventRow key={event.id} event={event} />
          ))}
        </View>
      ) : null}
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: palette.surface }}>
      {/* With a photo the buttons float over it and stay while the posts scroll;
          the status bar keeps a plain strip so it reads on any photo. */}
      {space.photo ? <View style={{ height: insets.top, backgroundColor: palette.surface }} /> : <Header left={<BackButton fallback="/spaces" />} right={options} />}
      <FeedList
        feed={feed}
        header={header}
        end="That's every post in this space."
        empty={<EmptyState title="Nothing here yet">{joined ? "Be the first to post in this space." : "Join to post here."}</EmptyState>}
      />
      {space.photo ? (
        <View pointerEvents="box-none" style={{ position: "absolute", top: insets.top + 8, left: 16, right: 16, flexDirection: "row", justifyContent: "space-between" }}>
          <BackButton fallback="/spaces" />
          {options}
        </View>
      ) : null}
      <ActionSheet
        title={space.name}
        open={menu}
        onClose={() => setMenu(false)}
        actions={[
          { label: "Share space", onPress: () => shareLink(siteLink(`/spaces/${space.slug}`)) },
          { label: "Report space", destructive: true, onPress: () => router.push({ pathname: "/report", params: { type: "space", id: space.id } }) },
        ]}
      />
    </View>
  );
}
