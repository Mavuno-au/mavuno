"use client";

import { useState } from "react";
import { updatePrivacy } from "@/app/actions/settings";
import { SaveBar, SettingsGroup } from "@/components/settings/layout";
import { useSave } from "@/components/settings/use-save";
import { Checkbox } from "@/components/ui/field";
import type { DmPolicy, PrivateSettings } from "@/lib/data/settings";

const DM_POLICIES: { value: DmPolicy; label: string; hint: string }[] = [
  { value: "everyone", label: "Everyone", hint: "Anyone can message you. People you don't follow land in Requests and can send one message until you accept." },
  { value: "following", label: "People I follow", hint: "Only people you follow can start a conversation with you." },
  { value: "nobody", label: "Nobody", hint: "No one can start a new conversation. Conversations you already have carry on." },
];

export function PrivacyForm({ settings }: { settings: PrivateSettings }) {
  const [form, setForm] = useState({ dmPolicy: settings.dmPolicy, discoverable: settings.discoverable, readReceipts: settings.readReceipts });
  const { pending, error, save } = useSave();

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        save(() => updatePrivacy(form), "Privacy settings saved");
      }}
    >
      <SettingsGroup title="Who can message me">
        <fieldset className="grid gap-1">
          <legend className="sr-only">Who can message me</legend>
          {DM_POLICIES.map((policy) => (
            <label key={policy.value} className="flex cursor-pointer items-start gap-3 rounded-md p-2 hover:bg-wash">
              <input type="radio" name="dmPolicy" className="mt-1 accent-(--primary)" checked={form.dmPolicy === policy.value} onChange={() => setForm({ ...form, dmPolicy: policy.value })} />
              <span className="grid gap-0.5">
                <span className="text-[15px] font-medium">{policy.label}</span>
                <span className="text-sm text-ink-muted">{policy.hint}</span>
              </span>
            </label>
          ))}
        </fieldset>
      </SettingsGroup>
      <SettingsGroup title="Being found" hint="Your city is the most precise location Mavuno ever shows. Your address and exact location are never stored.">
        <Checkbox
          label="Show me in Nearby and in suggestions"
          hint="People in and around your city can find you, and Mavuno can suggest you to people with shared interests. Your profile stays public either way."
          checked={form.discoverable}
          onChange={(event) => setForm({ ...form, discoverable: event.target.checked })}
        />
      </SettingsGroup>
      <SettingsGroup title="Messages">
        <Checkbox
          label="Send read receipts"
          hint="Others see when you've read their messages. Turn this off and you won't see theirs either."
          checked={form.readReceipts}
          onChange={(event) => setForm({ ...form, readReceipts: event.target.checked })}
        />
      </SettingsGroup>
      <SaveBar pending={pending} error={error} />
    </form>
  );
}
