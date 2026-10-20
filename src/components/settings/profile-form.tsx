"use client";

import { useState } from "react";
import { updateProfile } from "@/app/actions/settings";
import { ChoiceChips } from "@/components/settings/choice-chips";
import { INTEREST_CHOICES, knownInterests, knownOpenTo, OPEN_TO_CHOICES } from "@/components/settings/choices";
import { CitySelect } from "@/components/settings/city-select";
import { ColourPicker } from "@/components/settings/colour-picker";
import { SaveBar, SettingsGroup } from "@/components/settings/layout";
import { LinksEditor } from "@/components/settings/links-editor";
import { ProfileImages } from "@/components/settings/profile-images";
import { useSave } from "@/components/settings/use-save";
import { Field, Input, Textarea } from "@/components/ui/field";
import { LIMITS } from "@/lib/catalogue";
import type { City } from "@/lib/data/shell";
import type { EditableProfile } from "@/lib/data/settings";

export function ProfileForm({ profile, cities }: { profile: EditableProfile; cities: City[] }) {
  const [form, setForm] = useState(() => ({
    displayName: profile.displayName,
    bio: profile.bio,
    cityId: profile.cityId,
    heritage: profile.heritage,
    pronouns: profile.pronouns,
    interests: knownInterests(profile.interests),
    website: profile.website,
    links: profile.links,
    headline: profile.headline,
    occupation: profile.occupation,
    company: profile.company,
    industry: profile.industry,
    openTo: knownOpenTo(profile.openTo),
    colour: profile.colour,
  }));
  const { pending, error, save } = useSave();
  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => setForm((current) => ({ ...current, [key]: value }));

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        save(() => updateProfile(profile.id, form), "Profile saved");
      }}
    >
      <div className="px-4 pt-5 sm:px-6">
        <ProfileImages profileId={profile.id} person={{ displayName: form.displayName, colour: form.colour ?? profile.effectiveColour, accountType: "person" }} avatarUrl={profile.avatarUrl} bannerUrl={profile.bannerUrl} />
      </div>

      <SettingsGroup title="About you">
        <Field label="Name" htmlFor="displayName">
          <Input id="displayName" value={form.displayName} maxLength={60} required autoComplete="name" onChange={(event) => set("displayName", event.target.value)} />
        </Field>
        <Field label="Bio" htmlFor="bio" hint={<span className="font-mono text-xs tabular">{LIMITS.bio - form.bio.length} left</span>}>
          <Textarea id="bio" value={form.bio} maxLength={LIMITS.bio} onChange={(event) => set("bio", event.target.value)} placeholder="A line or two about you" />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="City" htmlFor="city" hint="Only your city is ever shown.">
            <CitySelect id="city" cities={cities} value={form.cityId} onChange={(cityId) => set("cityId", cityId)} />
          </Field>
          <Field label="Heritage" htmlFor="heritage" hint="Optional, in your own words.">
            <Input id="heritage" value={form.heritage} maxLength={60} placeholder="Ghanaian-Australian" onChange={(event) => set("heritage", event.target.value)} />
          </Field>
          <Field label="Pronouns" htmlFor="pronouns">
            <Input id="pronouns" value={form.pronouns} maxLength={30} placeholder="she/her" onChange={(event) => set("pronouns", event.target.value)} />
          </Field>
          <Field label="Website" htmlFor="website">
            <Input id="website" value={form.website} maxLength={200} inputMode="url" placeholder="https://" onChange={(event) => set("website", event.target.value)} />
          </Field>
        </div>
        <ChoiceChips label="Interests" choices={INTEREST_CHOICES} selected={form.interests} onChange={(interests) => set("interests", interests)} max={15} />
        <LinksEditor links={form.links} onChange={(links) => set("links", links)} />
      </SettingsGroup>

      <SettingsGroup title="Work" hint="Optional. Helps people find mentors, collaborators and hires.">
        <Field label="Headline" htmlFor="headline">
          <Input id="headline" value={form.headline} maxLength={100} placeholder="Nurse, mentor and weekend footballer" onChange={(event) => set("headline", event.target.value)} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Occupation" htmlFor="occupation">
            <Input id="occupation" value={form.occupation} maxLength={80} onChange={(event) => set("occupation", event.target.value)} />
          </Field>
          <Field label="Company" htmlFor="company">
            <Input id="company" value={form.company} maxLength={80} onChange={(event) => set("company", event.target.value)} />
          </Field>
          <Field label="Industry" htmlFor="industry">
            <Input id="industry" value={form.industry} maxLength={60} onChange={(event) => set("industry", event.target.value)} />
          </Field>
        </div>
        <ChoiceChips label="Open to" choices={OPEN_TO_CHOICES} selected={form.openTo} onChange={(openTo) => set("openTo", openTo)} />
      </SettingsGroup>

      <SettingsGroup title="Colour">
        <ColourPicker value={form.colour} onChange={(colour) => set("colour", colour)} />
      </SettingsGroup>

      <SaveBar pending={pending} error={error} />
    </form>
  );
}
