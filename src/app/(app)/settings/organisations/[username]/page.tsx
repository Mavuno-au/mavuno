import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DeleteOrganisation, OrganisationProfileForm, TeamManager } from "@/components/settings/organisation-forms";
import { loadTeam } from "@/lib/data/profiles";
import { loadEditableProfile } from "@/lib/data/settings";
import { loadCities } from "@/lib/data/shell";
import { requireViewer } from "@/lib/viewer";

export const metadata = { title: "Manage organisation" };

export default async function ManageOrganisationPage({ params }: PageProps<"/settings/organisations/[username]">) {
  const { username } = await params;
  const viewer = await requireViewer(`/settings/organisations/${username}`);
  const membership = viewer.organisations.find((org) => org.username === username.toLowerCase());
  if (!membership || membership.role === "editor") notFound();

  const [org, team, cities] = await Promise.all([loadEditableProfile({ id: membership.id }), loadTeam(membership.id), loadCities()]);
  if (!org) notFound();

  return (
    <>
      <div className="flex items-center gap-3 border-b border-hairline px-4 py-3 sm:px-6">
        <Link href="/settings/organisations" aria-label="Back to organisations" className="-ml-2 rounded-md p-2 text-ink-muted hover:bg-wash hover:text-ink">
          <ArrowLeft className="size-5" />
        </Link>
        <div className="min-w-0 flex-1">
          <h2 className="truncate font-semibold">{org.displayName}</h2>
          <p className="truncate font-mono text-xs text-ink-muted">@{org.username}</p>
        </div>
        <Link href={`/@${org.username}`} className="text-sm text-primary hover:underline">
          View profile
        </Link>
      </div>
      <OrganisationProfileForm org={org} cities={cities} />
      <TeamManager orgId={org.id} team={team} viewerId={viewer.id} viewerRole={membership.role} />
      {membership.role === "owner" ? <DeleteOrganisation org={org} /> : null}
    </>
  );
}
