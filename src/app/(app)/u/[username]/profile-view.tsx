import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Pin } from "lucide-react";
import { Feed } from "@/components/post/feed";
import { PostItem } from "@/components/post/post-item";
import { JsonLd } from "@/components/seo/json-ld";
import { EmptyState, PageHeader, Tabs, EndOfList } from "@/components/ui/page";
import { loadFeed } from "@/lib/data/posts";
import { loadFollowersYouKnow, loadPinnedPost, loadProfile, loadTeam } from "@/lib/data/profiles";
import { profileJsonLd } from "@/lib/structured-data";
import { getViewer } from "@/lib/viewer";
import { ProfileHeader } from "./profile-header";
import { ProfileUnavailable } from "./profile-unavailable";

const TABS = [
  { key: "posts", label: "Posts", path: "" },
  { key: "replies", label: "Replies", path: "/replies" },
  { key: "media", label: "Media", path: "/media" },
] as const;
export type ProfileTab = (typeof TABS)[number]["key"];

export async function profileMetadata(username: string): Promise<Metadata> {
  const viewer = await getViewer();
  const page = await loadProfile(username, viewer);
  if (page.kind !== "profile") return { title: "Profile" };
  const { profile } = page;
  // A profile with no posts and no bio is a thin page; keep it out of search until it isn't.
  const thin = profile.posts_count === 0 && !profile.bio && !profile.headline;
  return {
    title: `${profile.display_name} (@${profile.username})`,
    robots: thin ? { index: false, follow: true } : undefined,
    description: profile.bio || profile.headline || `${profile.display_name} on Mavuno`,
    alternates: { canonical: `/@${profile.username}`, types: { "application/atom+xml": [{ url: `/@${profile.username}/feed.xml`, title: `Posts by ${profile.display_name}` }] } },
    // The share image is drawn by ./opengraph-image.tsx.
    openGraph: { type: "profile", url: `/@${profile.username}`, username: profile.username },
  };
}

export async function ProfileView({ username, tab }: { username: string; tab: ProfileTab }) {
  const viewer = await getViewer();
  const page = await loadProfile(username, viewer);
  if (page.kind === "missing") notFound();
  if (page.kind === "unavailable") return <ProfileUnavailable page={page} />;

  const { profile } = page;
  const [feed, pinned, team, known] = await Promise.all([
    loadFeed({ kind: "profile", profileId: profile.id, tab }),
    tab === "posts" ? loadPinnedPost(profile.pinned_post_id) : Promise.resolve(null),
    profile.account_type === "organisation" ? loadTeam(profile.id) : Promise.resolve([]),
    loadFollowersYouKnow(profile.id, viewer),
  ]);
  const canManage = team.some((member) => member.id === viewer?.id && member.role !== "editor");
  const base = `/@${profile.username}`;

  return (
    <>
      <JsonLd data={profileJsonLd(profile)} />
      <PageHeader title={profile.display_name} meta={`${profile.posts_count} ${profile.posts_count === 1 ? "post" : "posts"}`} back="/" />
      <ProfileHeader profile={profile} team={team} canManage={canManage} known={known} />
      <Tabs className="border-b border-hairline" tabs={TABS.map(({ key, label, path }) => ({ href: `${base}${path}`, label, active: key === tab }))} />
      {pinned ? (
        <div>
          <p className="flex items-center gap-1.5 px-4 pt-3 font-mono text-xs text-ink-muted sm:px-6">
            <Pin className="size-3.5" /> Pinned
          </p>
          <PostItem row={pinned} pinned />
        </div>
      ) : null}
      <Feed
        key={tab}
        source={{ kind: "profile", profileId: profile.id, tab }}
        initial={feed.posts}
        next={feed.next}
        exclude={pinned ? [pinned.id] : []}
        dayMarkers={false}
        end="That's everything."
        empty={pinned ? <EndOfList>That's everything.</EndOfList> : <EmptyState title={tab === "posts" ? "No posts yet" : tab === "replies" ? "No replies yet" : "No photos yet"} />}
      />
    </>
  );
}
