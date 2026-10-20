"use client";

import { useState } from "react";
import { updateLanguages } from "@/app/actions/settings";
import { ChoiceChips } from "@/components/settings/choice-chips";
import { knownLanguages, LANGUAGE_CHOICES } from "@/components/settings/choices";
import { SaveBar, SettingsGroup } from "@/components/settings/layout";
import { useSave } from "@/components/settings/use-save";
import { Checkbox, Field, Select } from "@/components/ui/field";
import { LANGUAGES } from "@/lib/catalogue";
import type { PrivateSettings } from "@/lib/data/settings";

export function LanguagesForm({ settings, spoken }: { settings: PrivateSettings; spoken: string[] }) {
  const [form, setForm] = useState(() => ({
    languages: knownLanguages(spoken),
    translationLanguage: LANGUAGES.find((language) => language.code === settings.translationLanguage)?.code ?? null,
    feedLanguagesOnly: settings.feedLanguagesOnly,
  }));
  const { pending, error, save } = useSave();

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        save(() => updateLanguages(form), "Language settings saved");
      }}
    >
      <SettingsGroup title="Languages I speak" hint="Shown on your profile. You can limit your feeds to these below.">
        <ChoiceChips label="Languages" choices={LANGUAGE_CHOICES} selected={form.languages} onChange={(languages) => setForm({ ...form, languages })} max={12} />
      </SettingsGroup>
      <SettingsGroup title="Translations">
        <Field label="Translate posts into" htmlFor="translationLanguage">
          <Select
            id="translationLanguage"
            value={form.translationLanguage ?? ""}
            onChange={(event) => setForm({ ...form, translationLanguage: LANGUAGES.find((language) => language.code === event.target.value)?.code ?? null })}
          >
            <option value="">Browser language (automatic)</option>
            {LANGUAGES.map((language) => (
              <option key={language.code} value={language.code}>
                {language.name === language.native ? language.name : `${language.name} (${language.native})`}
              </option>
            ))}
          </Select>
        </Field>
      </SettingsGroup>
      <SettingsGroup title="Feeds">
        <Checkbox
          label="Only show posts in languages I speak"
          hint="Posts in other languages are left out of your feeds. You can still open them from a profile or a link."
          checked={form.feedLanguagesOnly}
          onChange={(event) => setForm({ ...form, feedLanguagesOnly: event.target.checked })}
        />
      </SettingsGroup>
      <SaveBar pending={pending} error={error} />
    </form>
  );
}
