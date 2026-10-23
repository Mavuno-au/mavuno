import * as Clipboard from "expo-clipboard";
import { router, useLocalSearchParams } from "expo-router";
import { Ellipsis, Link2, SearchX, Settings, Share, SquarePen, UserX } from "lucide-react-native";
import { useCallback, useEffect, useMemo, useState } from "react";
import { View } from "react-native";
import { usernameSchema } from "@/lib/schemas";
import type { Post } from "@/lib/domain";
import { reasonOf, type Reason } from "@/data/errors";
import { loadFeed, loadPinnedPost } from "@/data/posts";
import { loadFollowersYouKnow, loadProfile, loadTeam, type FollowersYouKnow, type ProfilePage, type TeamMember } from "@/data/profiles";
import { useSession, useViewer } from "@/data/session";
import { useFeed } from "@/data/use-feed";
import { ProfileHeader } from "@/people/profile-header";
import { FeedList } from "@/post/feed-list";
import { Button, EmptyState, IconButton, LoadFailed, PageSkeleton, Segmented } from "@/ui/controls";
import { BackButton, Header } from "@/ui/header";
import { ActionSheet } from "@/ui/sheet";
import { Text } from "@/ui/text";
import { HAIRLINE, usePalette } from "@/ui/theme";
import { toast } from "@/ui/toast";
import { onPostCreated, onProfileChanged, onRelationChanged } from "@/util/events";
import { profileLink, shareLink } from "@/util/links";
import { useSafetyActions } from "@/util/safety";

type ProfileTab = "posts" | "replies" | "media";

const TABS = [
  { key: "posts", label: "Posts" },
  { key: "replies", label: "Replies" },
  { key: "media", label: "Media" },
] as const satisfies readonly { key: ProfileTab; label: string }[];

const EMPTY: Record<ProfileTab, string> = { posts: "No posts yet", replies: "No replies yet", media: "No photos yet" };

type Extras = { pinned: Post | null; known: FollowersYouKnow | null; team: TeamMember[] };
type State = { kind: "loading" } | { kind: "failed"; reason: Reason } | ({ kind: "loaded"; page: ProfilePage } & Extras);

export default function ProfileScreen() {
  const palette = usePalette();
  const session = useSession();
  const viewerId = session.kind === "signed-in" ? session.session.user.id : "";
  const { username: param } = useLocalSearchParams<{ username: string }>();
  const username = usernameSchema.safeParse(param).data;
  const [tab, setTab] = useState<ProfileTab>("posts");
  // Kept with the username it was loaded for, so another profile never shows while this one loads.
  const [stored, setStored] = useState<{ username: string; state: State }>({ username: "", state: { kind: "loading" } });
  const state: State = !username ? { kind: "loaded", page: { kind: "missing" }, pinned: null, known: null, team: [] } : stored.username === username ? stored.state : { kind: "loading" };
  const viewer = useViewer();

  const fetchProfile = useCallback(
    (forUsername: string) => {
      loadProfile(forUsername, viewerId)
        .then(async (page): Promise<{ page: ProfilePage } & Extras> => {
          if (page.kind !== "profile") return { page, pinned: null, known: null, team: [] };
          const organisation = page.profile.account_type === "organisation";
          const [pinned, known, team] = await Promise.all([
            loadPinnedPost(page.profile.pinned_post_id),
            page.relationship.self ? null : loadFollowersYouKnow(page.profile.id).catch(() => null),
            organisation ? loadTeam(page.profile.id).catch(() => []) : [],
          ]);
          return { page, pinned, known, team };
        })
        .then(
          (loaded) => setStored({ username: forUsername, state: { kind: "loaded", ...loaded } }),
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

  // Editing and posting change what the profile shows.
  useEffect(() => {
    if (!username) return;
    return onPostCreated(() => fetchProfile(username));
  }, [username, fetchProfile]);

  const loadedId = state.kind === "loaded" && state.page.kind === "profile" ? state.page.profile.id : null;
  // Pinning or unpinning a post changes the pinned post above the feed.
  useEffect(() => {
    if (!username || !loadedId) return;
    return onProfileChanged((id) => {
      if (id === loadedId) fetchProfile(username);
    });
  }, [username, loadedId, fetchProfile]);

  const retry = () => {
    if (!username) return;
    setStored({ username, state: { kind: "loading" } });
    fetchProfile(username);
  };

  const profile = state.kind === "loaded" && state.page.kind === "profile" ? state.page : null;
  const profileId = profile?.profile.id ?? "";
  const posts = useFeed((cursor) => loadFeed({ kind: "profile", profileId, tab }, cursor), `${profileId}:${tab}`, { enabled: profileId !== "", takesPosts: true });
  // Pulling to refresh, or tapping the tab, reads the header and pinned post again too.
  const { refresh: refreshPosts } = posts;
  const refresh = useCallback(() => {
    refreshPosts();
    if (username) fetchProfile(username);
  }, [refreshPosts, username, fetchProfile]);
  const feed = useMemo(() => ({ ...posts, refresh }), [posts, refresh]);
  const manages = profile !== null && (viewer?.organisations.some((organisation) => organisation.id === profile.profile.id && organisation.role !== "editor") ?? false);

  const share = profile ? (
    <IconButton label="Share profile" onPress={() => shareLink(profileLink(profile.profile.username))}>
      <Share size={19} color={palette.ink} />
    </IconButton>
  ) : null;
  const right = profile ? (
    <>
      {share}
      {profile.relationship.self ? (
        <IconButton label="Settings" onPress={() => router.push("/settings")}>
          <Settings size={19} color={palette.ink} />
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
        {state.kind === "loading" ? <PageSkeleton avatar label="Loading profile" /> : null}
        {state.kind === "failed" ? <LoadFailed title="This profile didn't load" reason={state.reason} onRetry={retry} /> : null}
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
        pinnedId={pinned?.id}
        header={
          <View>
            <ProfileHeader profile={profile.profile} relationship={profile.relationship} manages={manages} known={state.known} team={state.team} />
            <View style={{ paddingHorizontal: 16, paddingBottom: 8, borderBottomWidth: HAIRLINE, borderBottomColor: palette.hairline }}>
              <Segmented label={`${profile.profile.display_name}'s posts`} options={TABS} value={tab} onChange={setTab} />
            </View>
          </View>
        }
        empty={
          // Your own empty profile offers the way to fill it, as Bluesky's does.
          profile.relationship.self && tab === "posts" ? (
            <EmptyState title={EMPTY.posts} action={<Button label="Write your first post" size="medium" icon={<SquarePen size={16} color={palette.primaryInk} />} onPress={() => router.push("/compose")} />} />
          ) : (
            <EmptyState title={EMPTY[tab]} />
          )
        }
      />
    </View>
  );
}

// Share profile, Copy link, Mute, Block and Report profile.
function ProfileMenu({ id, username, muted }: { id: string; username: string; muted: boolean }) {
  const palette = usePalette();
  const [open, setOpen] = useState(false);
  const safety = useSafetyActions({ id, username, muted });
  const actions = [
    { label: "Copy link", icon: <Link2 size={20} color={palette.inkMuted} />, onPress: () => void Clipboard.setStringAsync(profileLink(username)).then(() => toast("Link copied")) },
    ...safety.actions({ report: { type: "profile", id } }),
  ];
  return (
    <>
      <IconButton label="More" onPress={() => setOpen(true)}>
        <Ellipsis size={19} color={palette.ink} />
      </IconButton>
      <ActionSheet title={`@${username}`} actions={actions} open={open} onClose={() => setOpen(false)} />
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
