import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, View } from "react-native";
import { z } from "zod";
import { OPPORTUNITY_TYPES } from "@/lib/catalogue";
import { DEADLINE_ZONE, toZonedInput, type Opportunity } from "@/lib/community";
import type { OpportunityType } from "@/lib/domain";
import { loadOpportunity, saveOpportunity } from "@/data/community";
import { loadCities, type City } from "@/data/profiles";
import { useViewer } from "@/data/session";
import { useRulesGate } from "@/post/rules-sheet";
import { DateField } from "@/ui/date-field";
import { ChipPicker, FieldError, Group, SelectRow, SheetHeader, TextField, ToggleRow, useErrorScroll } from "@/ui/form";
import { font, Text } from "@/ui/text";
import { usePalette } from "@/ui/theme";
import { toast } from "@/ui/toast";

const TYPES = Object.entries(OPPORTUNITY_TYPES).flatMap(([value, type]) => {
  const key = Object.keys(OPPORTUNITY_TYPES).find((candidate): candidate is OpportunityType => candidate === value);
  return key ? [{ value: key, label: type.label }] : [];
});

type Form = {
  type: OpportunityType;
  title: string;
  organisation: string;
  description: string;
  cityId: number | null;
  remote: boolean;
  location: string;
  applyUrl: string;
  applyEmail: string;
  deadline: Date | null;
  compensation: string;
};

const blank = (): Form => ({ type: "job", title: "", organisation: "", description: "", cityId: null, remote: false, location: "", applyUrl: "", applyEmail: "", deadline: null, compensation: "" });

const formOf = (o: Opportunity): Form => ({
  type: o.type,
  title: o.title,
  organisation: o.organisation ?? "",
  description: o.description,
  cityId: o.cityId,
  remote: o.remote,
  location: o.location ?? "",
  applyUrl: o.applyUrl ?? "",
  applyEmail: o.applyEmail ?? "",
  deadline: o.deadlineAt ? new Date(o.deadlineAt) : null,
  compensation: o.compensation ?? "",
});

// The website's opportunity form, with rule 4 up front so people see it before posting.
export default function OpportunityForm() {
  const palette = usePalette();
  const viewer = useViewer();
  const rules = useRulesGate();
  const editing = z.uuid().safeParse(useLocalSearchParams().id).data ?? null;
  const [form, setForm] = useState<Form | null>(editing ? null : blank());
  const [posterId, setPosterId] = useState<string | null>(null);
  const [cities, setCities] = useState<City[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scroll = useErrorScroll(error);
  const viewerId = viewer?.id ?? null;

  useEffect(() => {
    void loadCities()
      .then(setCities)
      .catch(() => setCities([]));
  }, []);

  useEffect(() => {
    if (!editing || !viewerId) return;
    void loadOpportunity(editing, viewerId).then((found) => {
      if (found) setForm(formOf(found.opportunity));
      else setError("This opportunity couldn't be loaded.");
    });
  }, [editing, viewerId]);

  if (!viewer) return null;
  if (!form) {
    return (
      <View style={{ flex: 1, backgroundColor: palette.surface }}>
        <SheetHeader title="Edit opportunity" onCancel={() => router.back()} />
        {error ? <FieldError>{error}</FieldError> : <ActivityIndicator style={{ marginTop: 40 }} color={palette.inkMuted} accessibilityLabel="Loading" />}
      </View>
    );
  }

  const set = <Key extends keyof Form>(key: Key, value: Form[Key]) => setForm((current) => (current ? { ...current, [key]: value } : current));
  const posters = [{ id: viewer.id, displayName: "You" }, ...viewer.organisations.filter((organisation) => organisation.role !== "editor")];
  const poster = posters.find((candidate) => candidate.id === (posterId ?? viewer.id)) ?? posters[0];

  async function save() {
    if (!form || !viewer) return;
    if (!editing && !(await rules.ensure())) return;
    setBusy(true);
    setError(null);
    const fields: Record<string, string> = {
      type: form.type,
      title: form.title,
      organisation: form.organisation,
      description: form.description,
      cityId: form.cityId ? String(form.cityId) : "",
      remote: form.remote ? "on" : "",
      location: form.location,
      applyUrl: form.applyUrl,
      applyEmail: form.applyEmail,
      // A deadline closes at the end of its day on the east coast.
      deadline: form.deadline ? toZonedInput(form.deadline.toISOString(), DEADLINE_ZONE).slice(0, 10) : "",
      compensation: form.compensation,
    };
    const result = await saveOpportunity(viewer.id, fields, editing ? { id: editing } : { posterId: poster?.id ?? viewer.id });
    setBusy(false);
    if (!result.ok) return setError(result.error);
    router.back();
    toast(result.data.status === "pending" ? "Sent for review. A moderator will check it, usually within a day." : editing ? "Opportunity updated" : "Opportunity posted");
    if (!editing) router.push(`/opportunity/${result.data.id}`);
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1, backgroundColor: palette.shell }}>
      <SheetHeader title={editing ? "Edit opportunity" : "Post an opportunity"} onCancel={() => router.back()} action={{ label: editing ? "Save" : "Post", onPress: () => void save(), disabled: form.title.trim().length < 3, busy }} />
      <ScrollView ref={scroll} keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 16, gap: 18, paddingBottom: 48 }}>
        <View style={{ padding: 14, borderRadius: 12, backgroundColor: palette.primarySoft, gap: 4 }}>
          <Text variant="label" tone="primary">
            Rule 4: Fair jobs and opportunities
          </Text>
          <Text variant="subhead">Jobs pay at least the legal minimum and never ask applicants for money.</Text>
        </View>
        {error ? <FieldError>{error}</FieldError> : null}
        <ChipPicker label="Type" options={TYPES} selected={[form.type]} onToggle={(type) => set("type", type)} />
        <TextField label="Title" value={form.title} onChangeText={(text) => set("title", text)} maxLength={120} />
        {editing || posters.length < 2 ? null : (
          <Group>
            <SelectRow label="Posted by" options={posters.map((candidate) => ({ value: candidate.id, label: candidate.displayName }))} value={poster?.id ?? viewer.id} onChange={setPosterId} last />
          </Group>
        )}
        <TextField label="Organisation (optional)" value={form.organisation} onChangeText={(text) => set("organisation", text)} maxLength={120} />
        <View style={{ borderRadius: 14, overflow: "hidden", backgroundColor: palette.surface }}>
          <ToggleRow label="Remote" value={form.remote} onChange={(remote) => set("remote", remote)} last />
        </View>
        <Group>
          <SelectRow label="City" options={[{ value: 0, label: "No city" }, ...cities.map((city) => ({ value: city.id, label: `${city.name}, ${city.state}` }))]} value={form.cityId ?? 0} onChange={(cityId) => set("cityId", cityId || null)} last />
        </Group>
        <TextField label="Location (optional)" value={form.location} onChangeText={(text) => set("location", text)} maxLength={120} placeholder="Suburb or area" />
        <TextField label="Pay or value (optional)" value={form.compensation} onChangeText={(text) => set("compensation", text)} maxLength={120} placeholder="$32 an hour, $5,000 grant…" />
        <DateField label="Deadline (optional)" mode="date" value={form.deadline} onChange={(when) => set("deadline", when)} timeZone={DEADLINE_ZONE} minimumDate={editing ? undefined : new Date()} optional />
        <Text variant="label" style={{ fontSize: 14, fontFamily: font.semibold }}>
          How to apply
        </Text>
        <TextField label="Link" value={form.applyUrl} onChangeText={(text) => set("applyUrl", text)} keyboardType="url" autoCapitalize="none" autoCorrect={false} placeholder="https://" />
        <TextField label="Or email" value={form.applyEmail} onChangeText={(text) => set("applyEmail", text)} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} />
        <TextField label="Description" value={form.description} onChangeText={(text) => set("description", text)} maxLength={6000} limit={6000} multiline placeholder="What it is, who it's for, and what's needed" />
      </ScrollView>
      {rules.sheet}
    </KeyboardAvoidingView>
  );
}
