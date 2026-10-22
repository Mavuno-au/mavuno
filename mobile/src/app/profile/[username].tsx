import { useLocalSearchParams } from "expo-router";
import { CloudOff, LogOut, Pin, SearchX, Share, UserX } from "lucide-react-native";
import { useCallback, useEffect, useState } from "react";
import { Alert, View } from "react-native";
import { usernameSchema } from "@/lib/schemas";
import type { Post } from "@/lib/domain";
import { loadFeed, loadPinnedPost, type ProfileTab } from "@/data/posts";
import { loadProfile, type ProfilePage } from "@/data/profiles";
import { useSession } from "@/data/session";
import { supabase } from "@/data/supabase";
import { useFeed } from "@/data/use-feed";
import { ProfileHeader } from "@/people/profile-header";
import { FeedList } from "@/post/feed-list";
import { Button, EmptyState, FeedSkeleton, IconButton, Segmented } from "@/ui/controls";
import { BackButton, Header } from "@/ui/header";
import { Text } from "@/ui/text";
import { usePalette } from "@/ui/theme";
import { profileLink, shareLink } from "@/util/links";

const TABS = [
  { key: "posts", label: "Posts" },
  { key: "replies", label: "Replies" },
  { key: "media", label: "Media" },
] as const satisfies readonly { key: ProfileTab; label: string }[];

const EMPTY: Record<ProfileTab, string> = { posts: "No posts yet", replies: "No replies yet", media: "No photos yet" };

type State = { kind: "loading" } | { kind: "failed" } | { kind: "loaded"; page: ProfilePage; pinned: Post | null };

function signOut() {
  Alert.alert("Sign out of Mavuno?", undefined, [
    { text: "Cancel", style: "cancel" },
    { text: "Sign out", style: "destructive", onPress: () => void supabase.auth.signOut() },
  ]);
}

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
          () => setStored({ username: forUsername, state: { kind: "failed" } }),
        );
    },
    [viewerId],
  );

  useEffect(() => {
    if (username) fetchProfile(username);
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
  const right = profile?.relationship.self ? (
    <>
      {share}
      <IconButton label="Sign out" onPress={signOut}>
        <LogOut size={20} color={palette.ink} />
      </IconButton>
    </>
  ) : (
    share
  );
  const header = <Header left={<BackButton />} right={right} />;

  if (state.kind !== "loaded" || state.page.kind !== "profile" || !profile) {
    return (
      <View style={{ flex: 1, backgroundColor: palette.surface }}>
        {header}
        {state.kind === "loading" ? <FeedSkeleton rows={3} /> : null}
        {state.kind === "failed" ? (
          <EmptyState icon={<CloudOff size={26} color={palette.inkMuted} />} title="This profile didn't load" action={<Button label="Try again" size="medium" onPress={retry} />}>
            Check your connection, then try again.
          </EmptyState>
        ) : null}
        {state.kind === "loaded" && state.page.kind === "missing" ? (
          <EmptyState icon={<SearchX size={26} color={palette.inkMuted} />} title="We couldn't find that">
            This profile may have been deleted, or the username has changed.
          </EmptyState>
        ) : null}
        {state.kind === "loaded" && state.page.kind === "unavailable" ? (
          <>
            <Text variant="meta" tone="muted" style={{ paddingHorizontal: 16, fontSize: 15 }}>
              @{state.page.username}
            </Text>
            <EmptyState icon={<UserX size={26} color={palette.inkMuted} />} title="This profile isn't available">
              {state.page.blockedByViewer ? "You blocked this account. Unblock it to see their posts again." : "You can't see this account's posts."}
            </EmptyState>
          </>
        ) : null}
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
