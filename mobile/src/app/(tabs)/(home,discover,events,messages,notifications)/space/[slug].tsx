import { Image } from "expo-image";
import { router, useLocalSearchParams } from "expo-router";
import { Ellipsis, SquarePen } from "lucide-react-native";
import { useCallback, useEffect, useState } from "react";
import { Alert, View } from "react-native";
import type { CommunityEvent, Space, SpaceRole } from "@/lib/community";
import { compact } from "@/lib/format";
import { loadSpace, loadUpcomingEvents, setMembership } from "@/data/community";
import { reasonOf, type Reason } from "@/data/errors";
import { useViewer } from "@/data/session";
import { useFeed } from "@/data/use-feed";
import { loadFeed } from "@/data/posts";
import { EventRow } from "@/community/event-row";
import { FeedList } from "@/post/feed-list";
import { Button, EmptyState, FeedSkeleton, IconButton, LoadFailed } from "@/ui/controls";
import { BackButton, Header } from "@/ui/header";
import { ActionSheet } from "@/ui/sheet";
import { font, Text } from "@/ui/text";
import { usePalette } from "@/ui/theme";
import { toast } from "@/ui/toast";
import { openLink, shareLink } from "@/util/links";
import { siteLink } from "@/data/env";

type State = { kind: "missing" } | { kind: "failed"; reason: Reason } | { kind: "ready"; space: Space; role: SpaceRole | null; events: CommunityEvent[] };

// A city or interest space, as on the website: the city's photo with its
// credit and licence, Join, the next events, and the space's posts.
export default function SpaceScreen() {
  const palette = usePalette();
  const viewer = useViewer();
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
        <Header title="Space" left={<BackButton fallback="/spaces" />} />
        {state === undefined ? <FeedSkeleton rows={3} /> : null}
        {state?.kind === "missing" ? <EmptyState title="We couldn't find that space">It may have been renamed or removed.</EmptyState> : null}
        {state?.kind === "failed" ? <LoadFailed title="This space didn't load" reason={state.reason} onRetry={read} /> : null}
      </View>
    );
  }

  const joined = state.role !== null;
  async function toggle() {
    if (!viewerId || !space) return;
    setBusy(true);
    const result = await setMembership(viewerId, space.id, !joined);
    setBusy(false);
    if (!result.ok) return Alert.alert(joined ? "Couldn't leave" : "Couldn't join", result.error);
    toast(joined ? `Left ${space.name}` : `Joined ${space.name}`);
    read();
  }

  const header = (
    <View style={{ borderBottomWidth: 1, borderBottomColor: palette.hairline }}>
      {space.photo ? (
        <View>
          <Image source={space.photo.url} style={{ height: 180, backgroundColor: palette.wash }} contentFit="cover" accessibilityLabel={`${space.name}`} />
          <Text variant="caption" tone="muted" style={{ paddingHorizontal: 16, paddingTop: 6 }} accessibilityRole="link" onPress={() => space.photo && openLink(space.photo.sourceUrl)}>
            Photo: {space.photo.author}, {space.photo.license}
          </Text>
        </View>
      ) : null}
      <View style={{ padding: 16, gap: 10 }}>
        <Text variant="title" accessibilityRole="header">
          {space.emoji ? `${space.emoji} ` : ""}
          {space.name}
        </Text>
        {space.description ? <Text variant="callout">{space.description}</Text> : null}
        <Text variant="meta" tone="muted">
          {compact(space.members)} {space.members === 1 ? "member" : "members"} · {compact(space.posts)} {space.posts === 1 ? "post" : "posts"}
          {space.official ? " · Official" : ""}
        </Text>
        <View style={{ flexDirection: "row", gap: 10, flexWrap: "wrap" }}>
          <Button label={joined ? "Joined" : "Join"} variant={joined ? "outline" : "primary"} size="medium" busy={busy} onPress={() => void toggle()} />
          {joined ? (
            <Button
              label="Write in this space"
              variant="outline"
              size="medium"
              icon={<SquarePen size={16} color={palette.ink} />}
              onPress={() => router.push({ pathname: "/compose", params: { space: space.id, placeholder: `Write something for ${space.name}` } })}
            />
          ) : null}
        </View>
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
      <Header
        title={space.name}
        left={<BackButton fallback="/spaces" />}
        right={
          <IconButton label="Space options" onPress={() => setMenu(true)}>
            <Ellipsis size={19} color={palette.ink} />
          </IconButton>
        }
      />
      <FeedList
        feed={feed}
        header={header}
        end="That's every post in this space."
        empty={<EmptyState title="Nothing here yet">{joined ? "Be the first to post in this space." : "Join to post here."}</EmptyState>}
      />
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
