import { redirect } from "next/navigation";
import { Plus } from "lucide-react";
import { SpaceRow } from "@/components/community/rows";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState, PageHeader, Tabs } from "@/components/ui/page";
import { loadSpaces, type SpaceTab } from "@/lib/data/community";
import { getViewer } from "@/lib/viewer";
import { joinPath, signInPath } from "@/lib/safe-redirect";

export const SPACE_TABS: { tab: SpaceTab; label: string; href: string; signedIn: boolean }[] = [
  { tab: "city", label: "Cities", href: "/spaces", signedIn: false },
  { tab: "interest", label: "Interests", href: "/spaces/interests", signedIn: false },
  { tab: "joined", label: "Joined", href: "/spaces/joined", signedIn: true },
];

const EMPTY: Record<SpaceTab, string> = {
  city: "No city spaces yet.",
  interest: "No interest spaces yet.",
  joined: "Spaces you join show up here.",
};

export async function SpacesView({ tab }: { tab: SpaceTab }) {
  const viewer = await getViewer();
  if (!viewer && tab === "joined") redirect(signInPath("/spaces/joined"));
  const tabs = SPACE_TABS.filter((item) => viewer || !item.signedIn);
  const spaces = await loadSpaces(tab, viewer);

  return (
    <>
      <PageHeader
        title="Spaces"
        meta="Your city and the things you care about"
        actions={
          <ButtonLink href={viewer ? "/spaces/new" : joinPath("/spaces/new")} size="sm" variant="outline">
            <Plus /> Start a space
          </ButtonLink>
        }
      >
        <Tabs tabs={tabs.map((item) => ({ href: item.href, label: item.label, active: item.tab === tab }))} />
      </PageHeader>
      {spaces.length === 0 ? <EmptyState title="Nothing here yet">{EMPTY[tab]}</EmptyState> : spaces.map((space) => <SpaceRow key={space.id} space={space} />)}
    </>
  );
}
