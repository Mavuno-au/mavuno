import { router } from "expo-router";
import { useEffect, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView } from "react-native";
import { toUsername } from "@/lib/schemas";
import { loadCities, type City } from "@/data/profiles";
import { reloadViewer } from "@/data/session";
import { createOrganisation } from "@/data/settings";
import { FieldError, Group, SelectRow, SheetHeader, TextField } from "@/ui/form";
import { Text } from "@/ui/text";
import { usePalette } from "@/ui/theme";
import { toast } from "@/ui/toast";

// Create an organisation: a church, mosque, community group or business with
// its own profile, run by a team. You start as its owner.
export default function OrganisationForm() {
  const palette = usePalette();
  const [cities, setCities] = useState<City[]>([]);
  const [name, setName] = useState("");
  const [username, setUsername] = useState<string | null>(null);
  const [bio, setBio] = useState("");
  const [category, setCategory] = useState("");
  const [cityId, setCityId] = useState(0);
  const [website, setWebsite] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void loadCities()
      .then(setCities)
      .catch(() => setCities([]));
  }, []);

  const handle = username ?? toUsername(name);
  async function save() {
    setBusy(true);
    setError(null);
    const result = await createOrganisation({ username: handle, name, bio, category, cityId: cityId ? String(cityId) : "", website });
    setBusy(false);
    if (!result.ok) return setError(result.error);
    reloadViewer();
    router.back();
    toast("Organisation created");
    router.push(`/profile/${result.data}`);
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1, backgroundColor: palette.shell }}>
      <SheetHeader title="New organisation" onCancel={() => router.back()} action={{ label: "Create", onPress: () => void save(), disabled: name.trim().length < 2 || !handle, busy }} />
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 16, gap: 18 }}>
        {error ? <FieldError>{error}</FieldError> : null}
        <TextField label="Name" value={name} onChangeText={setName} maxLength={60} placeholder="Logan African Community Church" />
        <TextField label="Username" value={handle} onChangeText={(text) => setUsername(text.toLowerCase())} autoCapitalize="none" autoCorrect={false} mono maxLength={30} hint={`mavuno.au/@${handle || "username"}`} />
        <TextField label="Category (optional)" value={category} onChangeText={setCategory} maxLength={60} placeholder="Church, business, student group…" />
        <Group>
          <SelectRow label="City" options={[{ value: 0, label: "No city" }, ...cities.map((city) => ({ value: city.id, label: `${city.name}, ${city.state}` }))]} value={cityId} onChange={setCityId} last />
        </Group>
        <TextField label="Website (optional)" value={website} onChangeText={setWebsite} keyboardType="url" autoCapitalize="none" autoCorrect={false} placeholder="https://" />
        <TextField label="Bio (optional)" value={bio} onChangeText={setBio} maxLength={300} limit={300} multiline />
        <Text variant="small" tone="muted">
          Organisations get a verified badge once a moderator has checked them. Until then they work the same.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
