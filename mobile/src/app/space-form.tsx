import { router } from "expo-router";
import { useEffect, useState } from "react";
import { ScrollView, View } from "react-native";
import { createSpace } from "@/data/community";
import { loadCities, type City } from "@/data/profiles";
import { Segmented } from "@/ui/controls";
import { FieldError, Group, KeyboardSheet, SelectRow, SheetHeader, TextField, useErrorScroll } from "@/ui/form";
import { Text } from "@/ui/text";
import { usePalette } from "@/ui/theme";
import { toast } from "@/ui/toast";

// The address a name suggests, until the address is edited.
const slugOf = (name: string) =>
  name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);

// The website's Start a space: an interest or a place, its name, address,
// description and an emoji. Up to 3 new spaces a day.
export default function SpaceForm() {
  const palette = usePalette();
  const [cities, setCities] = useState<City[]>([]);
  const [kind, setKind] = useState<"interest" | "city">("interest");
  const [name, setName] = useState("");
  const [slug, setSlug] = useState<string | null>(null);
  const [cityId, setCityId] = useState<number | null>(null);
  const [emoji, setEmoji] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scroll = useErrorScroll(error);

  useEffect(() => {
    void loadCities()
      .then(setCities)
      .catch(() => setCities([]));
  }, []);

  const address = slug ?? slugOf(name);
  async function save() {
    setBusy(true);
    setError(null);
    const result = await createSpace({ name, slug: address, kind, cityId: cityId ? String(cityId) : "", emoji, description });
    setBusy(false);
    if (!result.ok) return setError(result.error);
    router.back();
    toast("Space created");
    router.push(`/space/${result.data}`);
  }

  return (
    <KeyboardSheet style={{ flex: 1, backgroundColor: palette.shell }}>
      <SheetHeader title="Start a space" onCancel={() => router.back()} action={{ label: "Create", onPress: () => void save(), disabled: name.trim().length < 2, busy }} />
      <ScrollView ref={scroll} keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 16, gap: 18 }}>
        {error ? <FieldError>{error}</FieldError> : null}
        <Segmented
          label="Kind of space"
          options={[
            { key: "interest", label: "An interest" },
            { key: "city", label: "A place" },
          ]}
          value={kind}
          onChange={setKind}
        />
        <TextField label="Name" value={name} onChangeText={setName} maxLength={60} placeholder={kind === "city" ? "Toowoomba" : "Afrobeats dancers"} />
        <TextField
          label="Address"
          hint={`mavuno.au/spaces/${address || "your-space"}`}
          value={address}
          onChangeText={(text) => setSlug(text.toLowerCase())}
          autoCapitalize="none"
          autoCorrect={false}
          maxLength={40}
          mono
        />
        {kind === "city" ? (
          <Group>
            <SelectRow label="City" options={cities.map((city) => ({ value: city.id, label: `${city.name}, ${city.state}` }))} value={cityId} onChange={setCityId} last />
          </Group>
        ) : null}
        <TextField label="Emoji" value={emoji} onChangeText={setEmoji} maxLength={16} placeholder="🎶" />
        <TextField label="Description" value={description} onChangeText={setDescription} maxLength={500} limit={500} multiline placeholder="What's this space for?" />
        <View>
          <Text variant="small" tone="muted">
            You can start up to 3 spaces a day. Space posts should stay on the space's topic (rule 5).
          </Text>
        </View>
      </ScrollView>
    </KeyboardSheet>
  );
}
