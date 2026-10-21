import { notFound } from "next/navigation";
import { EmptyState, PageHeader, Tabs } from "@/components/ui/page";
import { loadConnections, loadProfile, type Direction } from "@/lib/data/profiles";
import { getViewer } from "@/lib/viewer";
import { ConnectionList } from "./connection-list";
import { ProfileUnavailable } from "./profile-unavailable";

export async function Connections({ username, direction }: { username: string; direction: Direction }) {
  const viewer = await getViewer();
  const page = await loadProfile(username, viewer);
  if (page.kind === "missing") notFound();
  if (page.kind === "unavailable") return <ProfileUnavailable page={page} />;
  const { profile } = page;
  const connections = await loadConnections(profile.id, direction);
  const base = `/@${profile.username}`;

  return (
    <>
      <PageHeader title={profile.display_name} meta={`@${profile.username}`} back={base}>
        <Tabs
          tabs={[
            { href: `${base}/followers`, label: "Followers", active: direction === "followers" },
            { href: `${base}/following`, label: "Following", active: direction === "following" },
          ]}
        />
      </PageHeader>
      {connections.people.length === 0 && !connections.next ? (
        <EmptyState title={direction === "followers" ? "No followers yet" : "Not following anyone yet"} />
      ) : (
        <ConnectionList key={direction} profileId={profile.id} direction={direction} initial={connections} />
      )}
    </>
  );
}
