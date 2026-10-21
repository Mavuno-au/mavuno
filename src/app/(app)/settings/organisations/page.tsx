import { BadgeCheck, ChevronRight } from "lucide-react";
import Link from "next/link";
import { SettingsGroup } from "@/components/settings/layout";
import { CreateOrganisationForm, TeamInvitations } from "@/components/settings/organisation-forms";
import { Avatar } from "@/components/ui/avatar";
import { Chip } from "@/components/ui/page";
import { loadCities } from "@/lib/data/shell";
import { requireViewer } from "@/lib/viewer";

export const metadata = { title: "Organisations" };

const ROLE_LABELS = { owner: "Owner", admin: "Admin", editor: "Editor" } as const;

export default async function OrganisationSettingsPage() {
  const viewer = await requireViewer("/settings/organisations");
  const cities = await loadCities();
  return (
    <>
      <TeamInvitations invitations={viewer.invitations} />
      <SettingsGroup title="Organisations you help run" hint="Post, host events and list opportunities as an organisation. Switch who you're posting as in the composer.">
        {viewer.organisations.length === 0 ? (
          <p className="text-sm text-ink-muted">You're not on any organisation's team yet.</p>
        ) : (
          <ul className="-mx-4 divide-y divide-hairline border-y border-hairline sm:-mx-6">
            {viewer.organisations.map((org) => (
              <li key={org.id}>
                <Link href={org.role === "editor" ? `/@${org.username}` : `/settings/organisations/${org.username}`} className="flex items-center gap-3 px-4 py-3 hover:bg-wash sm:px-6">
                  <Avatar person={{ ...org, accountType: "organisation" }} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[15px] font-semibold">{org.displayName}</p>
                    <p className="truncate font-mono text-xs text-ink-muted">@{org.username}</p>
                  </div>
                  <Chip tone={org.role === "owner" ? "primary" : "muted"}>{ROLE_LABELS[org.role]}</Chip>
                  <ChevronRight aria-hidden className="size-4 text-ink-muted" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </SettingsGroup>
      <SettingsGroup
        title="Create an organisation"
        hint={
          <>
            For community associations, churches and mosques, businesses, clubs and charities. Moderators can verify an organisation, which adds a <BadgeCheck aria-label="verified" className="inline size-4 text-primary" /> to its name.
          </>
        }
      >
        <CreateOrganisationForm cities={cities} />
      </SettingsGroup>
    </>
  );
}
