"use client";

import { useState } from "react";
import { setSiteRole, updateSiteSettings } from "@/app/actions/moderation";
import { SaveBar, SettingsGroup } from "@/components/settings/layout";
import { useSave } from "@/components/settings/use-save";
import { Button } from "@/components/ui/button";
import { Checkbox, FormError, Input, Select } from "@/components/ui/field";
import type { SiteSettings } from "@/lib/data/moderation";

const ROLES = [
  { value: "member", label: "Member" },
  { value: "moderator", label: "Moderator" },
  { value: "admin", label: "Admin" },
] as const;

type SiteRole = (typeof ROLES)[number]["value"];

export function SiteSettingsForm({ settings }: { settings: SiteSettings }) {
  const [form, setForm] = useState(settings);
  const { pending, error, save } = useSave();
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        save(() => updateSiteSettings(form), "Site settings saved");
      }}
    >
      <SettingsGroup title="Site settings">
        <Checkbox
          label="Hold new members' posts for review"
          hint="Posts, events and opportunities from people who are new or haven't had anything approved wait in the review queue. When off, only people with a recent report wait."
          checked={form.premoderation}
          onChange={(event) => setForm({ ...form, premoderation: event.target.checked })}
        />
        <Checkbox
          label="Offer translations"
          hint="Shows a Translate button on posts in other languages, when a translation provider is set up."
          checked={form.translations}
          onChange={(event) => setForm({ ...form, translations: event.target.checked })}
        />
      </SettingsGroup>
      <SaveBar pending={pending} error={error} />
    </form>
  );
}

export function SiteRoleForm() {
  const [username, setUsername] = useState("");
  const [role, setRole] = useState<SiteRole>("moderator");
  const { pending, error, save } = useSave();
  const handle = username.trim().replace(/^@/, "");
  return (
    <SettingsGroup title="Roles" hint="Moderators review content and reports. Admins can also change these settings and roles. You can't change your own role.">
      <form
        className="grid gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          save(() => setSiteRole({ username: handle, role }), `@${handle} is now ${role === "admin" ? "an admin" : `a ${role}`}`, () => setUsername(""));
        }}
      >
        <label htmlFor="role-username" className="text-sm font-medium">
          Username
        </label>
        <div className="flex flex-wrap gap-2">
          <Input id="role-username" value={username} onChange={(event) => setUsername(event.target.value)} placeholder="@username" required autoCapitalize="none" className="min-w-0 flex-1 font-mono" />
          <Select aria-label="Role" value={role} onChange={(event) => setRole(ROLES.find((option) => option.value === event.target.value)?.value ?? "member")} className="w-36">
            {ROLES.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
          <Button type="submit" disabled={pending} className="min-w-24">
            {pending ? "Saving…" : "Set role"}
          </Button>
        </div>
        <FormError message={error} />
      </form>
    </SettingsGroup>
  );
}
