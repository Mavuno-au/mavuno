"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { acceptTeamInvitation, addTeamMember, declineTeamInvitation, createOrganisation, deleteOrganisation, handOverOwnership, removeTeamMember, setTeamRole, type TeamRole } from "@/app/actions/organisations";
import { updateProfile } from "@/app/actions/settings";
import { CitySelect } from "@/components/settings/city-select";
import { SaveBar, SettingsGroup } from "@/components/settings/layout";
import { LinksEditor } from "@/components/settings/links-editor";
import { ProfileImages } from "@/components/settings/profile-images";
import { useSave } from "@/components/settings/use-save";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, FormError, Input, Select, Textarea } from "@/components/ui/field";
import { Menu, type MenuItem } from "@/components/ui/menu";
import { Chip } from "@/components/ui/page";
import { LIMITS } from "@/lib/catalogue";
import type { City } from "@/lib/data/shell";
import type { EditableProfile } from "@/lib/data/settings";
import type { Colour } from "@/lib/domain";

export type OrgRole = "owner" | "admin" | "editor";

const ROLE_LABELS: Record<OrgRole, string> = { owner: "Owner", admin: "Admin", editor: "Editor" };

const ROLE_HINT = "Editors post, host events and list opportunities as the organisation. Admins can also edit its profile and manage the team. Owners can change roles and delete it.";

export function CreateOrganisationForm({ cities }: { cities: City[] }) {
  const [state, action, pending] = useActionState(createOrganisation, null);
  return (
    <form action={action} className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" htmlFor="org-name">
          <Input id="org-name" name="name" maxLength={60} required placeholder="Brisbane African Youth Network" />
        </Field>
        <Field label="Username" htmlFor="org-username" hint="Its profile will be at mavuno.au/@username.">
          <Input id="org-username" name="username" pattern="[A-Za-z0-9_]{3,30}" minLength={3} maxLength={30} required className="font-mono" autoCapitalize="none" />
        </Field>
      </div>
      <Field label="Bio" htmlFor="org-bio">
        <Textarea id="org-bio" name="bio" maxLength={LIMITS.bio} placeholder="What the organisation does and who it's for" />
      </Field>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Category" htmlFor="org-category">
          <Input id="org-category" name="category" maxLength={60} placeholder="Community association" />
        </Field>
        <Field label="City" htmlFor="org-city">
          <CitySelect id="org-city" name="cityId" cities={cities} value={null} />
        </Field>
        <Field label="Website" htmlFor="org-website">
          <Input id="org-website" name="website" inputMode="url" maxLength={200} placeholder="https://" />
        </Field>
      </div>
      <FormError message={state?.ok === false ? state.error : null} />
      <div>
        <Button type="submit" disabled={pending} className="min-w-44">
          {pending ? "Creating…" : "Create organisation"}
        </Button>
      </div>
    </form>
  );
}

export function OrganisationProfileForm({ org, cities }: { org: EditableProfile; cities: City[] }) {
  const [form, setForm] = useState(() => ({ displayName: org.displayName, bio: org.bio, category: org.category, cityId: org.cityId, website: org.website, links: org.links }));
  const { pending, error, save } = useSave();

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        save(() => updateProfile(org.id, form), "Organisation saved");
      }}
    >
      <div className="px-4 pt-5 sm:px-6">
        <ProfileImages profileId={org.id} person={{ displayName: form.displayName, colour: org.effectiveColour, accountType: "organisation" }} avatarUrl={org.avatarUrl} bannerUrl={org.bannerUrl} avatarLabel="logo" />
      </div>
      <SettingsGroup title="Profile">
        <Field label="Name" htmlFor="displayName">
          <Input id="displayName" value={form.displayName} maxLength={60} required onChange={(event) => setForm({ ...form, displayName: event.target.value })} />
        </Field>
        <Field label="Bio" htmlFor="bio" hint={<span className="font-mono text-xs tabular">{LIMITS.bio - form.bio.length} left</span>}>
          <Textarea id="bio" value={form.bio} maxLength={LIMITS.bio} onChange={(event) => setForm({ ...form, bio: event.target.value })} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Category" htmlFor="category">
            <Input id="category" value={form.category} maxLength={60} onChange={(event) => setForm({ ...form, category: event.target.value })} />
          </Field>
          <Field label="City" htmlFor="city">
            <CitySelect id="city" cities={cities} value={form.cityId} onChange={(cityId) => setForm({ ...form, cityId })} />
          </Field>
          <Field label="Website" htmlFor="website">
            <Input id="website" value={form.website} inputMode="url" maxLength={200} placeholder="https://" onChange={(event) => setForm({ ...form, website: event.target.value })} />
          </Field>
        </div>
        <LinksEditor links={form.links} onChange={(links) => setForm({ ...form, links })} />
      </SettingsGroup>
      <SaveBar pending={pending} error={error} />
    </form>
  );
}

export type TeamMember = { id: string; username: string; displayName: string; avatarUrl: string | null; colour: Colour; role: OrgRole; invited: boolean };

function AddMemberForm({ orgId }: { orgId: string }) {
  const [username, setUsername] = useState("");
  const [role, setRole] = useState<TeamRole>("editor");
  const { pending, error, save } = useSave();
  return (
    <form
      className="grid gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        save(() => addTeamMember({ orgId, username: username.replace(/^@/, ""), role }), `Added @${username.replace(/^@/, "")}`, () => setUsername(""));
      }}
    >
      <label htmlFor="add-member" className="text-sm font-medium">
        Add someone by username
      </label>
      <div className="flex flex-wrap gap-2">
        <Input id="add-member" value={username} onChange={(event) => setUsername(event.target.value)} placeholder="@username" required className="min-w-0 flex-1 font-mono" autoCapitalize="none" />
        <Select aria-label="Role" value={role} onChange={(event) => setRole(event.target.value === "admin" ? "admin" : "editor")} className="w-28">
          <option value="editor">Editor</option>
          <option value="admin">Admin</option>
        </Select>
        <Button type="submit" disabled={pending} className="min-w-20">
          {pending ? "Adding…" : "Add"}
        </Button>
      </div>
      <FormError message={error} />
    </form>
  );
}

export function TeamManager({ orgId, team, viewerId, viewerRole }: { orgId: string; team: TeamMember[]; viewerId: string; viewerRole: OrgRole }) {
  const { pending, error, save } = useSave();
  const [handOver, setHandOver] = useState<TeamMember | null>(null);
  const owner = viewerRole === "owner";

  function itemsFor(member: TeamMember): MenuItem[] {
    if (member.id === viewerId) return [{ kind: "action", label: "Leave organisation", danger: true, onSelect: () => save(() => removeTeamMember({ orgId, userId: member.id })) }];
    if (member.invited) return [{ kind: "action", label: "Withdraw invitation", danger: true, onSelect: () => save(() => removeTeamMember({ orgId, userId: member.id }), `Invitation to @${member.username} withdrawn`) }];
    const items: MenuItem[] = [];
    if (owner && member.role !== "owner") {
      const other: TeamRole = member.role === "admin" ? "editor" : "admin";
      items.push({ kind: "action", label: `Make ${ROLE_LABELS[other].toLowerCase()}`, onSelect: () => save(() => setTeamRole({ orgId, userId: member.id, role: other }), `@${member.username} is now an ${other}`) });
      items.push({ kind: "action", label: "Hand over ownership", onSelect: () => setHandOver(member) });
    }
    if (owner && member.role === "owner") {
      items.push({ kind: "action", label: "Make admin", onSelect: () => save(() => setTeamRole({ orgId, userId: member.id, role: "admin" }), `@${member.username} is now an admin`) });
    }
    if (member.role !== "owner") {
      items.push({ kind: "action", label: "Remove from team", danger: true, onSelect: () => save(() => removeTeamMember({ orgId, userId: member.id }), `Removed @${member.username}`) });
    }
    return items;
  }

  return (
    <SettingsGroup title="Team" hint={ROLE_HINT}>
      <ul className="-mx-4 divide-y divide-hairline border-y border-hairline sm:-mx-6" aria-busy={pending}>
        {team.map((member) => (
          <li key={member.id} className="flex items-center gap-3 px-4 py-3 sm:px-6">
            <Link href={`/@${member.username}`} className="shrink-0">
              <Avatar person={member} size="sm" />
            </Link>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[15px] font-semibold">
                {member.displayName}
                {member.id === viewerId ? <span className="font-normal text-ink-muted"> (you)</span> : null}
              </p>
              <p className="truncate font-mono text-xs text-ink-muted">@{member.username}</p>
            </div>
            <Chip tone={member.role === "owner" ? "primary" : "muted"}>{member.invited ? "Invited" : ROLE_LABELS[member.role]}</Chip>
            <Menu label={`Options for @${member.username}`} items={itemsFor(member)} />
          </li>
        ))}
      </ul>
      <FormError message={error} />
      <AddMemberForm orgId={orgId} />
      <Dialog
        open={handOver !== null}
        onClose={() => setHandOver(null)}
        title="Hand over ownership?"
        footer={
          <>
            <Button variant="ghost" onClick={() => setHandOver(null)}>
              Cancel
            </Button>
            <Button
              disabled={pending}
              className="min-w-32"
              onClick={() => {
                if (handOver) save(() => handOverOwnership({ orgId, userId: handOver.id }), `@${handOver.username} is now the owner`, () => setHandOver(null));
              }}
            >
              {pending ? "Handing over…" : "Hand over"}
            </Button>
          </>
        }
      >
        <p className="text-[15px]">@{handOver?.username} becomes an owner and you become an admin. Only an owner can change roles or delete the organisation.</p>
      </Dialog>
    </SettingsGroup>
  );
}

export function DeleteOrganisation({ org }: { org: { id: string; username: string } }) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const { pending, error, save } = useSave();
  return (
    <SettingsGroup title="Delete organisation" hint="Its profile, posts, events, opportunities and images are deleted for good. This can't be undone.">
      <div>
        <Button variant="destructive" onClick={() => setOpen(true)}>
          Delete organisation
        </Button>
      </div>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={`Delete @${org.username}?`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" disabled={pending || typed.trim().toLowerCase() !== org.username} className="min-w-44" onClick={() => save(() => deleteOrganisation(org.id))}>
              {pending ? "Deleting…" : "Delete organisation"}
            </Button>
          </>
        }
      >
        <Field label={`Type ${org.username} to confirm`} htmlFor="confirm-org-delete" error={error ?? undefined}>
          <Input id="confirm-org-delete" value={typed} onChange={(event) => setTyped(event.target.value)} autoComplete="off" autoCapitalize="none" spellCheck={false} className="font-mono" />
        </Field>
      </Dialog>
    </SettingsGroup>
  );
}

// Invitations the viewer has not answered yet, on the organisations settings page.
export function TeamInvitations({ invitations }: { invitations: { id: string; username: string; displayName: string; role: OrgRole }[] }) {
  const { pending, error, save } = useSave();
  if (invitations.length === 0) return null;
  return (
    <SettingsGroup title="Invitations" hint="Someone has asked you to help run their organisation. Nothing changes until you accept.">
      <ul className="-mx-4 divide-y divide-hairline border-y border-hairline sm:-mx-6" aria-busy={pending}>
        {invitations.map((org) => (
          <li key={org.id} className="flex items-center gap-3 px-4 py-3 sm:px-6">
            <div className="min-w-0 flex-1">
              <p className="truncate text-[15px] font-semibold">{org.displayName}</p>
              <p className="truncate font-mono text-xs text-ink-muted">
                @{org.username} · as {ROLE_LABELS[org.role].toLowerCase()}
              </p>
            </div>
            <Button size="sm" variant="outline" disabled={pending} onClick={() => save(() => declineTeamInvitation(org.id), `Declined @${org.username}`)}>
              Decline
            </Button>
            <Button size="sm" disabled={pending} onClick={() => save(() => acceptTeamInvitation(org.id), `You're on @${org.username}'s team`)}>
              Accept
            </Button>
          </li>
        ))}
      </ul>
      {error ? <p className="mt-2 text-sm text-destructive">{error}</p> : null}
    </SettingsGroup>
  );
}
