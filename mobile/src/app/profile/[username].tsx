import { router, useLocalSearchParams } from "expo-router";
import { CloudOff, Ellipsis, Pin, SearchX, Settings, Share, UserX } from "lucide-react-native";
import { useCallback, useEffect, useState } from "react";
import { View } from "react-native";
import { usernameSchema } from "@/lib/schemas";
import type { Post } from "@/lib/domain";
import { PROBLEM, reasonOf, type Reason } from "@/data/errors";
import { loadFeed, loadPinnedPost, type ProfileTab } from "@/data/posts";
import { loadProfile, type ProfilePage } from "@/data/profiles";
import { useSession } from "@/data/session";
import { useFeed } from "@/data/use-feed";
import { ProfileHeader } from "@/people/profile-header";
import { FeedList } from "@/post/feed-list";
import { Button, EmptyState, FeedSkeleton, IconButton, Segmented } from "@/ui/controls";
import { BackButton, Header } from "@/ui/header";
import { ActionSheet } from "@/ui/sheet";
import { Text } from "@/ui/text";
import { usePalette } from "@/ui/theme";
import { onRelationChanged } from "@/util/events";
import { profileLink, shareLink } from "@/util/links";
import { useSafetyActions } from "@/util/safety";

const TABS = [
  { key: "posts", label: "Posts" },
  { key: "replies", label: "Replies" },
  { key: "media", label: "Media" },
] as const satisfies readonly { key: ProfileTab; label: string }[];

const EMPTY: Record<ProfileTab, string> = { posts: "No posts yet", replies: "No replies yet", media: "No photos yet" };

type State = { kind: "loading" } | { kind: "failed"; reason: Reason } | { kind: "loaded"; page: ProfilePage; pinned: Post | null };

export default function ProfileScreen() {
  const palette = usePalette();
  const session = useSession();
  const viewerId = session.kind === "signed-in" ? session.session.user.id : "";
  const { username: param } = useLocalSearchParams<{ username: string }>();
  const username = usernameSchema.safeParse(param).data;
  const [tab, setTab] = useState<ProfileTab>("posts");
  // Kept with the username it was loaded for, so another profile never shows while this one loads.
  const [stored, setStored] = useState<{ username: string; state: State }>({ username: "", state: { kind: "loading" } });
  const state: State = !username ? { kind: "loaded", page: { kind: "missing" }, pinned: null } : stored.username === username ? stored.state : { kind: "loading" };

  const fetchProfile = useCallback(
    (forUsername: string) => {
      loadProfile(forUsername, viewerId)
        .then(async (page) => ({ page, pinned: page.kind === "profile" ? await loadPinnedPost(page.profile.pinned_post_id) : null }))
        .then(
          ({ page, pinned }) => setStored({ username: forUsername, state: { kind: "loaded", page, pinned } }),
          (error: unknown) => setStored({ username: forUsername, state: { kind: "failed", reason: reasonOf(error) } }),
        );
    },
    [viewerId],
  );

  useEffect(() => {
    if (username) fetchProfile(username);
  }, [username, fetchProfile]);

  // A mute, block or unblock changes the chips and whether the profile shows at all.
  useEffect(() => {
    if (!username) return;
    return onRelationChanged(() => fetchProfile(username));
  }, [username, fetchProfile]);

  const retry = () => {
    if (!username) return;
    setStored({ username, state: { kind: "loading" } });
    fetchProfile(username);
  };

  const profile = state.kind === "loaded" && state.page.kind === "profile" ? state.page : null;
  const profileId = profile?.profile.id ?? "";
  const feed = useFeed((cursor) => loadFeed({ kind: "profile", profileId, tab }, cursor), `${profileId}:${tab}`, { enabled: profileId !== "" });

  const share = profile ? (
    <IconButton label="Share profile" onPress={() => shareLink(profileLink(profile.profile.username))}>
      <Share size={20} color={palette.ink} />
    </IconButton>
  ) : null;
  const right = profile ? (
    <>
      {share}
      {profile.relationship.self ? (
        <IconButton label="Settings" onPress={() => router.push("/settings")}>
          <Settings size={20} color={palette.ink} />
        </IconButton>
      ) : (
        <ProfileMenu id={profile.profile.id} username={profile.profile.username} muted={profile.relationship.muted} />
      )}
    </>
  ) : null;
  const header = <Header left={<BackButton />} right={right} />;

  if (state.kind !== "loaded" || state.page.kind !== "profile" || !profile) {
    return (
      <View style={{ flex: 1, backgroundColor: palette.surface }}>
        {header}
        {state.kind === "loading" ? <FeedSkeleton rows={3} /> : null}
        {state.kind === "failed" ? (
          <EmptyState icon={<CloudOff size={26} color={palette.inkMuted} />} title="This profile didn't load" action={<Button label="Try again" size="medium" onPress={retry} />}>
            {PROBLEM[state.reason]}
          </EmptyState>
        ) : null}
        {state.kind === "loaded" && state.page.kind === "missing" ? (
          <EmptyState icon={<SearchX size={26} color={palette.inkMuted} />} title="We couldn't find that">
            This profile may have been deleted, or the username has changed.
          </EmptyState>
        ) : null}
        {state.kind === "loaded" && state.page.kind === "unavailable" ? <Unavailable page={state.page} /> : null}
      </View>
    );
  }

  const pinned = tab === "posts" ? state.pinned : null;
  return (
    <View style={{ flex: 1, backgroundColor: palette.surface }}>
      {header}
      <FeedList
        feed={feed}
        showPreviews={false}
        end="That's everything."
        leading={pinned ? [pinned] : []}
        header={
          <View>
            <ProfileHeader profile={profile.profile} relationship={profile.relationship} />
            <View style={{ paddingHorizontal: 16, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: palette.hairline }}>
              <Segmented label={`${profile.profile.display_name}'s posts`} options={TABS} value={tab} onChange={setTab} />
            </View>
            {pinned && feed.state.kind === "ready" ? (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 16, paddingTop: 12 }}>
                <Pin size={14} color={palette.inkMuted} />
                <Text variant="caption" tone="muted">
                  Pinned
                </Text>
              </View>
            ) : null}
          </View>
        }
        empty={<EmptyState title={EMPTY[tab]} />}
      />
    </View>
  );
}

// Mute, block and report for someone else's profile.
function ProfileMenu({ id, username, muted }: { id: string; username: string; muted: boolean }) {
  const palette = usePalette();
  const [open, setOpen] = useState(false);
  const safety = useSafetyActions({ id, username, muted });
  return (
    <>
      <IconButton label="More" onPress={() => setOpen(true)}>
        <Ellipsis size={20} color={palette.ink} />
      </IconButton>
      <ActionSheet title={`@${username}`} actions={[...safety.actions({ report: { type: "profile", id } }), safety.website(profileLink(username))]} open={open} onClose={() => setOpen(false)} />
    </>
  );
}

function Unavailable({ page }: { page: Extract<ProfilePage, { kind: "unavailable" }> }) {
  const palette = usePalette();
  const [busy, setBusy] = useState(false);
  const safety = useSafetyActions({ id: page.id, username: page.username, muted: false });
  return (
    <>
      <Text variant="meta" tone="muted" style={{ paddingHorizontal: 16, fontSize: 15 }}>
        @{page.username}
      </Text>
      <EmptyState
        icon={<UserX size={26} color={palette.inkMuted} />}
        title="This profile isn't available"
        action={
          page.blockedByViewer ? (
            <Button
              label={busy ? "Unblocking…" : "Unblock"}
              variant="outline"
              size="medium"
              busy={busy}
              onPress={() => {
                setBusy(true);
                void safety.unblock().finally(() => setBusy(false));
              }}
            />
          ) : null
        }
      >
        {page.blockedByViewer ? "You blocked this account. Unblock it to see their posts again." : "You can't see this account's posts."}
      </EmptyState>
    </>
  );
}
