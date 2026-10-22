import { Image } from "expo-image";
import { Check } from "lucide-react-native";
import { useEffect, useState, type ReactNode } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LIMITS } from "@/lib/catalogue";
import { INTEREST_CHOICES, knownInterests, knownLanguages, LANGUAGE_CHOICES, type Interest } from "@/lib/choices";
import type { SpaceListItem } from "@/lib/community";
import type { PersonSummary } from "@/lib/domain";
import { compact } from "@/lib/format";
import { INTEREST_SPACES } from "@/lib/onboarding";
import { toUsername } from "@/lib/schemas";
import { finishOnboarding, joinSpaces } from "@/data/auth";
import { loadOfficialSpaces, loadSuggestions } from "@/data/community";
import { loadCities, loadEditableProfile, updateProfile, type City, type EditableProfile } from "@/data/profiles";
import { reloadViewer, useViewer } from "@/data/session";
import { PersonRow } from "@/people/person-row";
import { Wordmark } from "@/ui/brand";
import { Button } from "@/ui/controls";
import { ChipPicker, FieldError, SelectRow, TextField } from "@/ui/form";
import { Text } from "@/ui/text";
import { usePalette } from "@/ui/theme";

const STEPS = ["About you", "Follow a few people", "Join spaces", "How Mavuno works"] as const;

// The website's three points, without its keyboard shortcuts, naming the app's settings.
const HOW_IT_WORKS = [
  ["Your posts go up straight away", "Everyone can see what you post as soon as you post it, so follow the community rules. If something of yours is reported, a moderator takes a look."],
  ["Report, mute and block", "Use the menu on any post, message or profile. Moderators never see who reported something. Manage who you've muted or blocked in Settings, Muted and blocked."],
  ["Only your city is shown", "Mavuno never stores or shows your suburb, address or exact location. Turn off Nearby and suggestions in Settings, Privacy."],
] as const;

type Loaded = { profile: EditableProfile; cities: City[]; people: PersonSummary[]; organisations: PersonSummary[]; spaces: SpaceListItem[] };

// The website's onboarding (src/app/onboarding/onboarding-flow.tsx): four
// steps, each skippable, and finishing opens Home.
export default function Onboarding() {
  const palette = usePalette();
  const viewer = useViewer();
  const viewerId = viewer?.id ?? null;
  const [loaded, setLoaded] = useState<Loaded | "loading" | "failed">("loading");
  const [attempt, setAttempt] = useState(0);
  const [step, setStep] = useState(0);
  const [about, setAbout] = useState<{ cityId: number | null; interests: Interest[] } | null>(null);
  const [finishing, setFinishing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!viewerId) return;
    let current = true;
    // Suggestions and spaces are extras: without them the steps still work.
    void Promise.all([loadEditableProfile(viewerId), loadCities().catch(() => []), loadSuggestions(8, "person").catch(() => []), loadSuggestions(6, "organisation").catch(() => []), loadOfficialSpaces(viewerId).catch(() => [])])
      .then(([profile, cities, people, organisations, spaces]) => {
        if (current) setLoaded(profile ? { profile, cities, people, organisations, spaces } : "failed");
      })
      .catch(() => current && setLoaded("failed"));
    return () => {
      current = false;
    };
  }, [viewerId, attempt]);

  async function finish() {
    if (!viewerId) return;
    setFinishing(true);
    setError(null);
    const result = await finishOnboarding(viewerId);
    setFinishing(false);
    if (!result.ok) return setError(result.error);
    reloadViewer();
  }

  const skip = <Button label="Skip setup" variant="plain" size="medium" busy={finishing} onPress={() => void finish()} />;

  if (loaded === "loading" || loaded === "failed") {
    return (
      <Frame top={skip}>
        {loaded === "loading" ? (
          <ActivityIndicator style={{ marginTop: 40 }} color={palette.inkMuted} accessibilityLabel="Loading" />
        ) : (
          <View style={{ gap: 16, paddingTop: 24 }}>
            <Text variant="callout">Your profile couldn't be loaded. Check your connection and try again.</Text>
            <Button label="Try again" variant="outline" onPress={() => {
              setLoaded("loading");
              setAttempt((count) => count + 1);
            }} />
          </View>
        )}
      </Frame>
    );
  }

  const chosen = about ?? { cityId: loaded.profile.cityId, interests: knownInterests(loaded.profile.interests) };
  return (
    <Frame top={skip} page={step}>
      {step === 0 ? (
        <Text variant="callout" tone="muted">
          Welcome to Mavuno, {loaded.profile.displayName.split(" ")[0]}. A few quick steps and you're in.
        </Text>
      ) : null}
      <View style={{ gap: 8 }}>
        <View accessible accessibilityLabel={`Step ${step + 1} of ${STEPS.length}`} style={{ flexDirection: "row", gap: 6 }}>
          {STEPS.map((name, index) => (
            <View key={name} style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: index <= step ? palette.primary : palette.hairline }} />
          ))}
        </View>
        <Text variant="caption" tone="muted">
          Step {step + 1} of {STEPS.length}
        </Text>
        <Text variant="title" accessibilityRole="header">
          {STEPS[step]}
        </Text>
      </View>
      {step === 0 ? (
        <AboutYou
          profile={loaded.profile}
          cities={loaded.cities}
          onSaved={(next) => {
            setAbout(next);
            setStep(1);
            // Suggestions follow the city and interests just saved.
            void Promise.all([loadSuggestions(8, "person"), loadSuggestions(6, "organisation")])
              .then(([people, organisations]) => setLoaded((current) => (typeof current === "object" ? { ...current, people, organisations } : current)))
              .catch(() => undefined);
          }}
        />
      ) : null}
      {step === 1 ? <FollowPeople people={loaded.people} organisations={loaded.organisations} onBack={() => setStep(0)} onNext={() => setStep(2)} /> : null}
      {step === 2 && viewerId ? <JoinSpaceStep viewerId={viewerId} spaces={loaded.spaces} about={chosen} onBack={() => setStep(1)} onNext={() => setStep(3)} /> : null}
      {step === 3 ? (
        <View style={{ gap: 18 }}>
          {HOW_IT_WORKS.map(([title, text]) => (
            <View key={title} style={{ gap: 4 }}>
              <Text variant="headline">{title}</Text>
              <Text variant="callout" tone="muted">
                {text}
              </Text>
            </View>
          ))}
          {error ? <FieldError>{error}</FieldError> : null}
          <Actions onBack={() => setStep(2)}>
            <Button label="Start exploring" busy={finishing} onPress={() => void finish()} />
          </Actions>
        </View>
      ) : null}
    </Frame>
  );
}

// `page` gives each step a fresh scroll view, so it opens at its title.
function Frame({ top, page = 0, children }: { top: ReactNode; page?: number; children: ReactNode }) {
  const palette = usePalette();
  const insets = useSafeAreaInsets();
  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1, backgroundColor: palette.surface }}>
      <View style={{ paddingTop: insets.top, paddingHorizontal: 16, minHeight: 52 + insets.top, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <Wordmark />
        {top}
      </View>
      <ScrollView key={page} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: insets.bottom + 24, gap: 20 }}>
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Actions({ onBack, children }: { onBack?: () => void; children: ReactNode }) {
  return (
    <View style={{ gap: 10, paddingTop: 8 }}>
      {children}
      {onBack ? <Button label="Back" variant="plain" onPress={onBack} /> : null}
    </View>
  );
}

function AboutYou({ profile, cities, onSaved }: { profile: EditableProfile; cities: City[]; onSaved: (about: { cityId: number | null; interests: Interest[] }) => void }) {
  const palette = usePalette();
  const [form, setForm] = useState(() => ({
    displayName: profile.displayName,
    username: profile.username,
    bio: profile.bio,
    cityId: profile.cityId,
    heritage: profile.heritage,
    languages: knownLanguages(profile.languages),
    interests: knownInterests(profile.interests),
  }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const toggle = <Value extends string>(values: Value[], value: Value) => (values.includes(value) ? values.filter((other) => other !== value) : [...values, value]);
  const cityOptions = [{ value: 0, label: "No city" }, ...cities.map((city) => ({ value: city.id, label: `${city.name}, ${city.state}` }))];

  async function save() {
    setBusy(true);
    setError(null);
    const result = await updateProfile(profile.id, form);
    setBusy(false);
    if (!result.ok) return setError(result.error);
    onSaved({ cityId: form.cityId, interests: form.interests });
  }

  return (
    <View style={{ gap: 16 }}>
      <Text variant="callout" tone="muted">
        This is what people see on your profile. You can change all of it later in Settings.
      </Text>
      <TextField label="Name" value={form.displayName} onChangeText={(displayName) => setForm({ ...form, displayName })} maxLength={60} textContentType="name" />
      <TextField label="Username" value={form.username} onChangeText={(text) => setForm({ ...form, username: toUsername(text) })} maxLength={30} autoCapitalize="none" autoCorrect={false} mono />
      <TextField label="Bio" value={form.bio} onChangeText={(bio) => setForm({ ...form, bio })} limit={LIMITS.bio} maxLength={LIMITS.bio} multiline placeholder="What you do, what you care about, where your family is from" />
      <View style={{ gap: 6 }}>
        <View style={{ borderRadius: 12, borderWidth: 1, borderColor: palette.rail, overflow: "hidden" }}>
          <SelectRow label="City" options={cityOptions} value={form.cityId ?? 0} onChange={(cityId) => setForm({ ...form, cityId: cityId === 0 ? null : cityId })} last />
        </View>
        <Text variant="small" tone="muted">
          Only your city is ever shown. Never your suburb or address.
        </Text>
      </View>
      <TextField label="Heritage" hint="Optional, in your own words." value={form.heritage} onChangeText={(heritage) => setForm({ ...form, heritage })} maxLength={60} placeholder="Ghanaian-Australian" />
      <ChipPicker label="Languages you speak" options={LANGUAGE_CHOICES} selected={form.languages} onToggle={(value) => setForm({ ...form, languages: toggle(form.languages, value) })} max={12} />
      <ChipPicker label="Interests" options={INTEREST_CHOICES} selected={form.interests} onToggle={(value) => setForm({ ...form, interests: toggle(form.interests, value) })} max={15} />
      {error ? <FieldError>{error}</FieldError> : null}
      <Actions>
        <Button label="Continue" busy={busy} onPress={() => void save()} />
      </Actions>
    </View>
  );
}

function FollowPeople({ people, organisations, onBack, onNext }: { people: PersonSummary[]; organisations: PersonSummary[]; onBack: () => void; onNext: () => void }) {
  const list = (title: string, rows: PersonSummary[]) =>
    rows.length === 0 ? null : (
      <View>
        <Text variant="label" tone="muted" accessibilityRole="header" style={{ paddingBottom: 4 }}>
          {title}
        </Text>
        <View style={{ marginHorizontal: -20 }}>
          {rows.map((person) => (
            <PersonRow key={person.id} person={person} detail={person.reason} open={false} />
          ))}
        </View>
      </View>
    );
  return (
    <View style={{ gap: 16 }}>
      <Text variant="callout" tone="muted">
        Follow people and organisations to see their posts in your Following feed. Picked for your city and interests.
      </Text>
      {people.length + organisations.length === 0 ? <Text variant="callout">No suggestions yet. Discover has people and organisations to explore once you're in.</Text> : null}
      {list("People", people)}
      {list("Organisations", organisations)}
      <Actions onBack={onBack}>
        <Button label="Continue" onPress={onNext} />
      </Actions>
    </View>
  );
}

function JoinSpaceStep({ viewerId, spaces, about, onBack, onNext }: { viewerId: string; spaces: SpaceListItem[]; about: { cityId: number | null; interests: Interest[] }; onBack: () => void; onNext: () => void }) {
  const [picked, setPicked] = useState<ReadonlySet<string> | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const citySpaces = spaces.filter((space) => space.kind === "city" && space.cityId !== null && space.cityId === about.cityId);
  const interestSpaces = spaces.filter((space) => space.kind === "interest");
  const suggested = new Set(about.interests.flatMap((interest) => INTEREST_SPACES[interest] ?? []));
  const selected = picked ?? new Set([...citySpaces, ...interestSpaces.filter((space) => suggested.has(space.slug))].map((space) => space.id));
  const toJoin = [...selected].filter((spaceId) => !spaces.some((space) => space.id === spaceId && space.joined));

  const toggle = (spaceId: string) => {
    const next = new Set(selected);
    if (next.has(spaceId)) next.delete(spaceId);
    else next.add(spaceId);
    setPicked(next);
  };

  async function join() {
    setBusy(true);
    setError(null);
    const result = await joinSpaces(viewerId, toJoin);
    setBusy(false);
    if (!result.ok) return setError(result.error);
    onNext();
  }

  return (
    <View style={{ gap: 16 }}>
      <Text variant="callout" tone="muted">
        Spaces are groups for a city or a shared interest. Their posts show up in your Following feed.
      </Text>
      <View>
        <Text variant="label" tone="muted" accessibilityRole="header">
          Your city
        </Text>
        {citySpaces.length === 0 ? (
          <Text variant="subhead" tone="muted" style={{ paddingVertical: 12 }}>
            {about.cityId ? "There's no space for your city yet. You can start one later." : "Add your city in step 1 to see its space."}
          </Text>
        ) : (
          citySpaces.map((space) => <SpaceOption key={space.id} space={space} checked={selected.has(space.id)} onToggle={() => toggle(space.id)} />)
        )}
      </View>
      <View>
        <Text variant="label" tone="muted" accessibilityRole="header">
          Interests
        </Text>
        {interestSpaces.map((space) => (
          <SpaceOption key={space.id} space={space} checked={selected.has(space.id)} onToggle={() => toggle(space.id)} />
        ))}
      </View>
      {error ? <FieldError>{error}</FieldError> : null}
      <Actions onBack={onBack}>
        <Button label={toJoin.length > 0 ? `Join ${toJoin.length} and continue` : "Continue"} busy={busy} onPress={() => void join()} />
      </Actions>
    </View>
  );
}

function SpaceOption({ space, checked, onToggle }: { space: SpaceListItem; checked: boolean; onToggle: () => void }) {
  const palette = usePalette();
  const on = checked || space.joined;
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: on, disabled: space.joined }}
      accessibilityLabel={`${space.name}. ${space.description}`}
      disabled={space.joined}
      onPress={onToggle}
      style={({ pressed }) => ({ flexDirection: "row", alignItems: "flex-start", gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: palette.hairline, opacity: pressed ? 0.7 : 1 })}
    >
      <View style={{ width: 24, height: 24, marginTop: 10, borderRadius: 12, borderWidth: on ? 0 : 2, borderColor: palette.rail, backgroundColor: on ? palette.primary : "transparent", alignItems: "center", justifyContent: "center" }}>
        {on ? <Check size={15} color={palette.primaryInk} strokeWidth={3} /> : null}
      </View>
      <View style={{ width: 44, height: 44, borderRadius: 10, overflow: "hidden", backgroundColor: palette.wash, alignItems: "center", justifyContent: "center" }}>
        {space.photo ? <Image source={space.photo.thumbUrl} style={{ width: 44, height: 44 }} contentFit="cover" accessible={false} /> : <Text style={{ fontSize: 22 }}>{space.emoji ?? "🌱"}</Text>}
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
          <Text variant="name" style={{ flexShrink: 1 }}>
            {space.name}
          </Text>
          <Text variant="caption" tone="muted">
            {space.joined ? "Joined" : `${compact(space.members)} ${space.members === 1 ? "member" : "members"}`}
          </Text>
        </View>
        {space.description ? (
          <Text variant="subhead" tone="muted">
            {space.description}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}
