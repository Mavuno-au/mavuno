import { useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, View } from "react-native";
import { LANGUAGES, type LanguageCode } from "@/lib/catalogue";
import { knownLanguages, LANGUAGE_CHOICES } from "@/lib/choices";
import { isLanguage } from "@/lib/profile-form";
import { reasonOf, type Reason } from "@/data/errors";
import { loadPrivateSettings } from "@/data/profiles";
import { reloadViewer, useViewer } from "@/data/session";
import { updateLanguages } from "@/data/settings";
import { Button, LoadFailed } from "@/ui/controls";
import { ChipPicker, FieldError, Group, SelectRow, ToggleRow } from "@/ui/form";
import { BackButton, Header } from "@/ui/header";
import { Text } from "@/ui/text";
import { usePalette } from "@/ui/theme";
import { toast } from "@/ui/toast";

type Form = { languages: LanguageCode[]; translationLanguage: LanguageCode | null; feedLanguagesOnly: boolean };

// The languages you speak (shown on your profile), an option to limit feeds
// to them, and the language to translate posts into.
export default function LanguageSettings() {
  const palette = usePalette();
  const viewer = useViewer();
  const [settings, setSettings] = useState<Omit<Form, "languages"> | null>(null);
  // Null until a language is ticked: the ones on the profile. The viewer is
  // read again on every return to the app, which mustn't undo the ticks.
  const [picked, setPicked] = useState<LanguageCode[] | null>(null);
  const [failed, setFailed] = useState<Reason | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const viewerId = viewer?.id ?? null;
  const form: Form | null = settings && { ...settings, languages: picked ?? knownLanguages(viewer?.languages ?? []) };
  const setForm = ({ languages, ...rest }: Form) => {
    setPicked(languages);
    setSettings(rest);
  };

  useEffect(() => {
    if (!viewerId) return;
    void loadPrivateSettings(viewerId).then(
      (loaded) =>
        setSettings({
          translationLanguage: loaded.translationLanguage && isLanguage(loaded.translationLanguage) ? loaded.translationLanguage : null,
          feedLanguagesOnly: loaded.feedLanguagesOnly,
        }),
      (problem: unknown) => setFailed(reasonOf(problem)),
    );
  }, [viewerId, attempt]);

  async function save() {
    if (!viewerId || !form) return;
    setBusy(true);
    setError(null);
    const result = await updateLanguages(viewerId, form);
    setBusy(false);
    if (!result.ok) return setError(result.error);
    reloadViewer();
    toast("Languages saved");
  }

  return (
    <View style={{ flex: 1, backgroundColor: palette.shell }}>
      <Header title="Languages" left={<BackButton fallback="/settings" />} />
      {failed && !form ? (
        <LoadFailed
          title="Your settings didn't load"
          reason={failed}
          onRetry={() => {
            setFailed(null);
            setAttempt((count) => count + 1);
          }}
        />
      ) : !form ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={palette.inkMuted} accessibilityLabel="Loading" />
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, gap: 24, paddingBottom: 48 }}>
          <View style={{ gap: 6 }}>
            <ChipPicker
              label="Languages I speak"
              options={LANGUAGE_CHOICES}
              selected={form.languages}
              max={12}
              onToggle={(code) => setForm({ ...form, languages: form.languages.includes(code) ? form.languages.filter((other) => other !== code) : [...form.languages, code] })}
            />
            <Text variant="small" tone="muted">
              Shown on your profile. You can limit your feeds to these below.
            </Text>
          </View>
          <Group>
            <SelectRow
              label="Translate posts into"
              options={[{ value: "", label: "My phone's language" }, ...LANGUAGES.map((language) => ({ value: language.code, label: language.name }))]}
              value={form.translationLanguage ?? ""}
              onChange={(code) => setForm({ ...form, translationLanguage: isLanguage(code) ? code : null })}
            />
            <ToggleRow
              label="Only show posts in languages I speak"
              hint="Posts in other languages are left out of your feeds. You can still open them from a profile or a link."
              value={form.feedLanguagesOnly}
              onChange={(feedLanguagesOnly) => setForm({ ...form, feedLanguagesOnly })}
              last
            />
          </Group>
          {error ? <FieldError>{error}</FieldError> : null}
          <Button label="Save" busy={busy} disabled={form.languages.length === 0} onPress={() => void save()} />
        </ScrollView>
      )}
    </View>
  );
}
