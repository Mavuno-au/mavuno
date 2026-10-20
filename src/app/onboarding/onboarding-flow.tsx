"use client";

import { Check } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { finishOnboarding, joinSpaces, updateProfile } from "@/app/actions/settings";
import { trackEvent } from "@/components/shell/analytics";
import { Wordmark } from "@/components/shell/brand";
import { PersonRow } from "@/components/people/person-row";
import { ChoiceChips } from "@/components/settings/choice-chips";
import { INTEREST_CHOICES, knownInterests, knownLanguages, LANGUAGE_CHOICES, type Interest } from "@/components/settings/choices";
import { CitySelect } from "@/components/settings/city-select";
import { useSave } from "@/components/settings/use-save";
import { Button } from "@/components/ui/button";
import { Field, FormError, Input, Textarea } from "@/components/ui/field";
import { LIMITS } from "@/lib/catalogue";
import { SpaceAvatar } from "@/components/community/city-photo";
import { cn } from "@/lib/cn";
import type { PersonSummary } from "@/lib/domain";
import type { EditableProfile, SpaceChoice } from "@/lib/data/settings";
import type { City } from "@/lib/data/shell";
import { compact } from "@/lib/format";
import { toUsername } from "@/lib/schemas";

const STEPS = ["About you", "Follow a few people", "Join spaces", "How Mavuno works"] as const;

// Official interest spaces are broader than interests, so several interests lead to one space.
const INTEREST_SPACES: Partial<Record<Interest, string>> = {
  careers: "careers",
  business: "business",
  tech: "tech",
  education: "students",
  health: "health",
  faith: "faith",
  food: "food",
  music: "arts",
  arts: "arts",
  fashion: "arts",
  film: "arts",
  writing: "arts",
  photography: "arts",
  football: "sport",
  basketball: "sport",
  running: "sport",
  parenting: "parents",
  housing: "housing",
  politics: "advocacy",
  volunteering: "advocacy",
  languages: "heritage",
  youth: "youth",
};

const SHORTCUTS = [
  ["c", "Write a post"],
  ["/", "Search people"],
  ["g h", "Go home"],
  ["?", "See every shortcut"],
] as const;

function StepMarker({ state, last }: { state: "done" | "current" | "todo"; last: boolean }) {
  return (
    <div aria-hidden className="relative w-8 shrink-0 sm:w-10">
      {last ? null : <span className={cn("absolute top-4 bottom-0 left-1/2 -translate-x-1/2", state === "done" ? "w-0.5 bg-primary" : "border-l-2 border-dashed border-rail")} />}
      <span
        className={cn(
          "absolute top-1 left-1/2 flex size-6 -translate-x-1/2 items-center justify-center rounded-full font-mono text-xs",
          state === "todo" ? "border-2 border-rail bg-surface text-ink-muted" : "bg-primary text-primary-ink",
        )}
      >
        {state === "done" ? <Check className="size-3.5" /> : null}
      </span>
    </div>
  );
}

function Step({ index, current, title, children }: { index: number; current: number; title: string; children: ReactNode }) {
  const state = index < current ? "done" : index === current ? "current" : "todo";
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (state === "current" && index > 0) heading.current?.focus();
  }, [state, index]);

  return (
    <li className="flex" aria-current={state === "current" ? "step" : undefined}>
      <StepMarker state={state} last={index === STEPS.length - 1} />
      <div className={cn("min-w-0 flex-1", index < STEPS.length - 1 && "pb-8")}>
        <p className="font-mono text-xs leading-6 text-ink-muted">
          Step {index + 1} of {STEPS.length}
        </p>
        {state === "current" ? (
          <section aria-labelledby={`step-${index}`}>
            <h1 ref={heading} id={`step-${index}`} tabIndex={-1} className="text-2xl font-semibold tracking-tight outline-none">
              {title}
            </h1>
            <div className="mt-4">{children}</div>
          </section>
        ) : (
          <p className={cn("text-[15px]", state === "todo" && "text-ink-muted")}>
            {title}
            {state === "done" ? <span className="sr-only"> (done)</span> : null}
          </p>
        )}
      </div>
    </li>
  );
}

function Actions({ onBack, children }: { onBack?: () => void; children: ReactNode }) {
  return (
    <div className="mt-8 flex flex-wrap items-center gap-2">
      {children}
      {onBack ? (
        <Button variant="ghost" onClick={onBack}>
          Back
        </Button>
      ) : null}
    </div>
  );
}

function AboutYou({ profile, cities, onSaved }: { profile: EditableProfile; cities: City[]; onSaved: (about: { cityId: number | null; interests: Interest[] }) => void }) {
  const [form, setForm] = useState(() => ({
    displayName: profile.displayName,
    username: profile.username,
    bio: profile.bio,
    cityId: profile.cityId,
    heritage: profile.heritage,
    languages: knownLanguages(profile.languages),
    interests: knownInterests(profile.interests),
  }));
  const { pending, error, save } = useSave();

  return (
    <form
      className="grid gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        save(() => updateProfile(profile.id, form), undefined, () => onSaved({ cityId: form.cityId, interests: form.interests }));
      }}
    >
      <p className="text-[15px] text-ink-muted">This is what people see on your profile. You can change all of it later in Settings.</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" htmlFor="displayName">
          <Input id="displayName" value={form.displayName} maxLength={60} required autoComplete="name" onChange={(event) => setForm({ ...form, displayName: event.target.value })} />
        </Field>
        <Field label="Username" htmlFor="username">
          <Input id="username" value={form.username} maxLength={30} required autoCapitalize="none" className="font-mono" onChange={(event) => setForm({ ...form, username: toUsername(event.target.value) })} />
        </Field>
      </div>
      <Field label="Bio" htmlFor="bio" hint={<span className="font-mono text-xs tabular">{LIMITS.bio - form.bio.length} left</span>}>
        <Textarea id="bio" value={form.bio} maxLength={LIMITS.bio} placeholder="What you do, what you care about, where your family is from" onChange={(event) => setForm({ ...form, bio: event.target.value })} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="City" htmlFor="city" hint="Only your city is ever shown. Never your suburb or address.">
          <CitySelect id="city" cities={cities} value={form.cityId} onChange={(cityId) => setForm({ ...form, cityId })} />
        </Field>
        <Field label="Heritage" htmlFor="heritage" hint="Optional, in your own words.">
          <Input id="heritage" value={form.heritage} maxLength={60} placeholder="Ghanaian-Australian" onChange={(event) => setForm({ ...form, heritage: event.target.value })} />
        </Field>
      </div>
      <ChoiceChips label="Languages you speak" choices={LANGUAGE_CHOICES} selected={form.languages} onChange={(languages) => setForm({ ...form, languages })} max={12} />
      <ChoiceChips label="Interests" choices={INTEREST_CHOICES} selected={form.interests} onChange={(interests) => setForm({ ...form, interests })} max={15} />
      <FormError message={error} />
      <Actions>
        <Button type="submit" disabled={pending} className="min-w-28">
          {pending ? "Saving…" : "Continue"}
        </Button>
      </Actions>
    </form>
  );
}

function SuggestionList({ title, people }: { title: string; people: PersonSummary[] }) {
  if (people.length === 0) return null;
  return (
    <section className="mt-4">
      <h2 className="mb-1 text-sm font-medium text-ink-muted">{title}</h2>
      <div className="divide-y divide-hairline">
        {people.map((person) => (
          <PersonRow key={person.id} person={person} detail={person.reason} compact />
        ))}
      </div>
    </section>
  );
}

function SpaceOption({ space, checked, joined, onChange }: { space: SpaceChoice; checked: boolean; joined: boolean; onChange: (on: boolean) => void }) {
  return (
    <label className={cn("flex items-start gap-3 py-3", joined ? "cursor-default" : "cursor-pointer")}>
      <input type="checkbox" className="mt-1 size-4 accent-(--primary)" checked={checked || joined} disabled={joined} onChange={(event) => onChange(event.target.checked)} />
      <SpaceAvatar photo={space.photo} emoji={space.emoji} />
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline justify-between gap-3">
          <span className="text-[15px] font-medium">{space.name}</span>
          <span className="shrink-0 font-mono text-xs text-ink-muted">{joined ? "Joined" : `${compact(space.members)} members`}</span>
        </span>
        <span className="block text-sm text-ink-muted">{space.description}</span>
      </span>
    </label>
  );
}

export function OnboardingFlow({
  next,
  profile,
  cities,
  suggestions,
  spaces,
  joined,
}: {
  next: string;
  profile: EditableProfile;
  cities: City[];
  suggestions: { people: PersonSummary[]; organisations: PersonSummary[] };
  spaces: SpaceChoice[];
  joined: string[];
}) {
  const [step, setStep] = useState(0);
  const [about, setAbout] = useState({ cityId: profile.cityId, interests: knownInterests(profile.interests) });
  const [picked, setPicked] = useState<ReadonlySet<string> | null>(null);
  const finishing = useSave();
  const joining = useSave();

  const citySpaces = spaces.filter((space) => space.kind === "city" && space.cityId !== null && space.cityId === about.cityId);
  const interestSpaces = spaces.filter((space) => space.kind === "interest");
  const suggestedSlugs = new Set(about.interests.flatMap((interest) => INTEREST_SPACES[interest] ?? []));
  const defaults = new Set([...citySpaces, ...interestSpaces.filter((space) => suggestedSlugs.has(space.slug))].map((space) => space.id));
  const selected = picked ?? defaults;
  const toJoin = [...selected].filter((spaceId) => !joined.includes(spaceId));

  const toggle = (spaceId: string, on: boolean) => {
    const next = new Set(selected);
    if (on) next.add(spaceId);
    else next.delete(spaceId);
    setPicked(next);
  };

  const finish = () => {
    trackEvent("signup");
    finishing.save(() => finishOnboarding(next));
  };

  return (
    <div className="min-h-dvh bg-shell">
      <header className="mx-auto flex max-w-2xl items-center justify-between px-4 py-4">
        <Wordmark />
        <Button variant="ghost" onClick={finish} disabled={finishing.pending}>
          Skip setup
        </Button>
      </header>
      <main className="mx-auto max-w-2xl px-4 pb-16">
        <div className="rounded-xl border border-hairline bg-surface px-4 py-6 sm:px-8 sm:py-8">
          <p className="mb-6 text-[15px] text-ink-muted">Welcome to Mavuno, {profile.displayName.split(" ")[0]}. A few quick steps and you're in.</p>
          <ol>
            <Step index={0} current={step} title={STEPS[0]}>
              <AboutYou
                profile={profile}
                cities={cities}
                onSaved={(next) => {
                  setAbout(next);
                  setStep(1);
                }}
              />
            </Step>
            <Step index={1} current={step} title={STEPS[1]}>
              <p className="text-[15px] text-ink-muted">Follow people and organisations to see their posts in your Following feed. Picked for your city and interests.</p>
              {suggestions.people.length + suggestions.organisations.length === 0 ? (
                <p className="mt-4 text-[15px]">No suggestions yet. Discover has people and organisations to explore once you're in.</p>
              ) : null}
              <SuggestionList title="People" people={suggestions.people} />
              <SuggestionList title="Organisations" people={suggestions.organisations} />
              <Actions onBack={() => setStep(0)}>
                <Button onClick={() => setStep(2)} className="min-w-28">
                  Continue
                </Button>
              </Actions>
            </Step>
            <Step index={2} current={step} title={STEPS[2]}>
              <p className="text-[15px] text-ink-muted">Spaces are groups for a city or a shared interest. Their posts show up in your Following feed.</p>
              <section className="mt-4">
                <h2 className="text-sm font-medium text-ink-muted">Your city</h2>
                {citySpaces.length === 0 ? (
                  <p className="py-3 text-sm text-ink-muted">{about.cityId ? "There's no space for your city yet. You can start one later." : "Add your city in step 1 to see its space."}</p>
                ) : (
                  <div className="divide-y divide-hairline">
                    {citySpaces.map((space) => (
                      <SpaceOption key={space.id} space={space} checked={selected.has(space.id)} joined={joined.includes(space.id)} onChange={(on) => toggle(space.id, on)} />
                    ))}
                  </div>
                )}
              </section>
              <section className="mt-4">
                <h2 className="text-sm font-medium text-ink-muted">Interests</h2>
                <div className="divide-y divide-hairline">
                  {interestSpaces.map((space) => (
                    <SpaceOption key={space.id} space={space} checked={selected.has(space.id)} joined={joined.includes(space.id)} onChange={(on) => toggle(space.id, on)} />
                  ))}
                </div>
              </section>
              <FormError message={joining.error} />
              <Actions onBack={() => setStep(1)}>
                <Button disabled={joining.pending} className="min-w-36" onClick={() => joining.save(() => joinSpaces(toJoin), undefined, () => setStep(3))}>
                  {joining.pending ? "Joining…" : toJoin.length > 0 ? `Join ${toJoin.length} and continue` : "Continue"}
                </Button>
              </Actions>
            </Step>
            <Step index={3} current={step} title={STEPS[3]}>
              <ul className="grid gap-4 text-[15px]">
                <li>
                  <p className="font-medium">Your posts go up straight away</p>
                  <p className="text-ink-muted">Everyone can see what you post as soon as you post it, so follow the community rules. If something of yours is reported, a moderator takes a look.</p>
                </li>
                <li>
                  <p className="font-medium">Report, mute and block</p>
                  <p className="text-ink-muted">Use the menu on any post, message or profile. Moderators never see who reported something. Manage who you've muted or blocked in Settings, Safety.</p>
                </li>
                <li>
                  <p className="font-medium">Only your city is shown</p>
                  <p className="text-ink-muted">Mavuno never stores or shows your suburb, address or exact location. Turn off Nearby and suggestions in Settings, Privacy.</p>
                </li>
                <li>
                  <p className="font-medium">Keyboard shortcuts</p>
                  <dl className="mt-2 grid gap-1.5">
                    {SHORTCUTS.map(([keys, action]) => (
                      <div key={keys} className="flex items-center gap-3">
                        <dt>
                          <kbd className="inline-block min-w-8 rounded border border-rail px-1.5 py-0.5 text-center font-mono text-xs">{keys}</kbd>
                        </dt>
                        <dd className="text-ink-muted">{action}</dd>
                      </div>
                    ))}
                  </dl>
                </li>
              </ul>
              <FormError message={finishing.error} />
              <Actions onBack={() => setStep(2)}>
                <Button onClick={finish} disabled={finishing.pending} className="min-w-36">
                  {finishing.pending ? "Opening Mavuno…" : "Start exploring"}
                </Button>
              </Actions>
            </Step>
          </ol>
        </div>
      </main>
    </div>
  );
}
