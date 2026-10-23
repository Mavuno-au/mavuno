import { Image } from "expo-image";
import { router, useLocalSearchParams } from "expo-router";
import { Camera } from "lucide-react-native";
import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, View } from "react-native";
import { z } from "zod";
import { AU_TIMEZONES, EVENT_CATEGORIES, EVENT_FORMATS, type EventCategory } from "@/lib/catalogue";
import { toZonedInput, type AuTimezone, type CommunityEvent, type EventFormat } from "@/lib/community";
import { loadEvent, loadSpaces, saveEvent, type SpaceListItem } from "@/data/community";
import { MEDIA_URL } from "@/data/posts";
import { loadCities, type City } from "@/data/profiles";
import { useViewer } from "@/data/session";
import { pickImages, uploadImage } from "@/data/upload";
import { useRulesGate } from "@/post/rules-sheet";
import { Segmented } from "@/ui/controls";
import { DateField } from "@/ui/date-field";
import { FieldError, Group, KeyboardSheet, SelectRow, SheetHeader, TextField, ToggleRow, useErrorScroll, useReturnChain } from "@/ui/form";
import { Text } from "@/ui/text";
import { usePalette } from "@/ui/theme";
import { toast } from "@/ui/toast";

const FORMATS = Object.entries(EVENT_FORMATS).flatMap(([key, label]) => (key === "in_person" || key === "online" || key === "hybrid" ? [{ key, label: key === "hybrid" ? "Both" : label }] : []));
const categoryOf = (value: string): EventCategory => (Object.keys(EVENT_CATEGORIES).find((key): key is EventCategory => key === value) ?? "community");
const formatOf = (value: string): EventFormat => (value === "online" || value === "hybrid" ? value : "in_person");
const zoneOf = (value: string): AuTimezone => AU_TIMEZONES.find((zone) => zone.value === value)?.value ?? "Australia/Brisbane";

type Form = {
  title: string;
  description: string;
  category: EventCategory;
  format: EventFormat;
  timezone: AuTimezone;
  startsAt: Date | null;
  endsAt: Date | null;
  cityId: number | null;
  venue: string;
  address: string;
  onlineUrl: string;
  ticketUrl: string;
  coverUrl: string | null;
  free: boolean;
  capacity: string;
  spaceId: string | null;
};

const blank = (): Form => ({
  title: "",
  description: "",
  category: "community",
  format: "in_person",
  timezone: zoneOf(Intl.DateTimeFormat().resolvedOptions().timeZone),
  startsAt: null,
  endsAt: null,
  cityId: null,
  venue: "",
  address: "",
  onlineUrl: "",
  ticketUrl: "",
  coverUrl: null,
  free: true,
  capacity: "",
  spaceId: null,
});

const formOf = (event: CommunityEvent): Form => ({
  title: event.title,
  description: event.description,
  category: event.category,
  format: event.format,
  timezone: zoneOf(event.timezone),
  startsAt: new Date(event.startsAt),
  endsAt: event.endsAt ? new Date(event.endsAt) : null,
  cityId: event.cityId,
  venue: event.venue ?? "",
  address: event.address ?? "",
  onlineUrl: event.onlineUrl ?? "",
  ticketUrl: event.ticketUrl ?? "",
  coverUrl: event.coverUrl,
  free: event.free,
  capacity: event.capacity ? String(event.capacity) : "",
  spaceId: event.spaceId,
});

// The website's event form (src/components/community/event-form.tsx) as a
// sheet, in its order. New events from new members may go to review first.
export default function EventForm() {
  const palette = usePalette();
  const viewer = useViewer();
  const rules = useRulesGate();
  const editing = z.uuid().safeParse(useLocalSearchParams().id).data ?? null;
  const [form, setForm] = useState<Form | null>(editing ? null : blank());
  const [hostId, setHostId] = useState<string | null>(null);
  const [cities, setCities] = useState<City[]>([]);
  const [spaces, setSpaces] = useState<SpaceListItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scroll = useErrorScroll(error);
  const viewerId = viewer?.id ?? null;

  useEffect(() => {
    void loadCities()
      .then(setCities)
      .catch(() => setCities([]));
    if (viewerId) void loadSpaces("joined", viewerId).then(setSpaces).catch(() => setSpaces([]));
  }, [viewerId]);

  useEffect(() => {
    if (!editing || !viewerId) return;
    void loadEvent(editing, viewerId).then((found) => {
      if (found) setForm(formOf(found.event));
      else setError("This event couldn't be loaded.");
    });
  }, [editing, viewerId]);

  // Where it is and how to get in follow one another; the title and the
  // description stand on their own.
  const field = useReturnChain([...(form?.format === "online" ? [] : ["venue", "address"]), ...(form?.format === "in_person" ? [] : ["onlineUrl"]), "ticketUrl", "capacity"]);

  if (!viewer) return null;
  if (!form) {
    return (
      <View style={{ flex: 1, backgroundColor: palette.surface }}>
        <SheetHeader title="Edit event" onCancel={() => router.back()} />
        {error ? <FieldError>{error}</FieldError> : <ActivityIndicator style={{ marginTop: 40 }} color={palette.inkMuted} accessibilityLabel="Loading" />}
      </View>
    );
  }

  const set = <Key extends keyof Form>(key: Key, value: Form[Key]) => setForm((current) => (current ? { ...current, [key]: value } : current));
  const hosts = [{ id: viewer.id, displayName: "You" }, ...viewer.organisations.filter((organisation) => organisation.role !== "editor")];
  const host = hosts.find((candidate) => candidate.id === (hostId ?? viewer.id)) ?? hosts[0];
  const local = (when: Date | null) => (when ? toZonedInput(when.toISOString(), form.timezone) : "");

  async function addCover() {
    const [picked] = await pickImages(1);
    if (!picked || !viewer) return;
    setUploading(true);
    const uploaded = await uploadImage(picked, { bucket: "media", folder: "events", ownerId: host?.id ?? viewer.id });
    setUploading(false);
    if (!uploaded.ok) return Alert.alert("The upload failed", uploaded.error);
    set("coverUrl", `${MEDIA_URL}${uploaded.data.path}`);
  }

  async function save() {
    if (!form || !viewer) return;
    if (!editing && !(await rules.ensure())) return;
    setBusy(true);
    setError(null);
    const fields: Record<string, string> = {
      title: form.title,
      description: form.description,
      category: form.category,
      format: form.format,
      timezone: form.timezone,
      startsAt: local(form.startsAt),
      endsAt: local(form.endsAt),
      cityId: form.cityId ? String(form.cityId) : "",
      venue: form.venue,
      address: form.address,
      onlineUrl: form.onlineUrl,
      ticketUrl: form.ticketUrl,
      coverUrl: form.coverUrl ?? "",
      free: form.free ? "on" : "",
      capacity: form.capacity,
      spaceId: form.spaceId ?? "",
    };
    const result = await saveEvent(viewer.id, fields, editing ? { id: editing } : { hostId: host?.id ?? viewer.id });
    setBusy(false);
    if (!result.ok) return setError(result.error);
    router.back();
    toast(result.data.status === "pending" ? "Sent for review. A moderator will check it, usually within a day." : editing ? "Event updated" : "Event published");
    if (!editing) router.push(`/event/${result.data.id}`);
  }

  return (
    <KeyboardSheet style={{ flex: 1, backgroundColor: palette.shell }}>
      <SheetHeader title={editing ? "Edit event" : "Host an event"} onCancel={() => router.back()} action={{ label: editing ? "Save" : "Publish", onPress: () => void save(), disabled: form.title.trim().length < 3 || !form.startsAt, busy }} />
      <ScrollView ref={scroll} keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 16, gap: 18, paddingBottom: 48 }}>
        {error ? <FieldError>{error}</FieldError> : null}
        <Pressable accessibilityRole="button" accessibilityLabel={form.coverUrl ? "Change cover photo" : "Add a cover photo"} onPress={() => void addCover()} style={{ height: 160, borderRadius: 14, overflow: "hidden", backgroundColor: palette.wash, alignItems: "center", justifyContent: "center", gap: 6 }}>
          {form.coverUrl ? <Image source={form.coverUrl} style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0 }} contentFit="cover" /> : null}
          {uploading ? (
            <ActivityIndicator color={palette.inkMuted} />
          ) : (
            <>
              <Camera size={22} color={palette.inkMuted} />
              {form.coverUrl ? null : (
                <Text variant="subhead" tone="muted">
                  Add a cover photo
                </Text>
              )}
            </>
          )}
        </Pressable>
        <TextField label="Title" value={form.title} onChangeText={(text) => set("title", text)} maxLength={120} />
        {editing || hosts.length < 2 ? null : (
          <Group>
            <SelectRow label="Host" options={hosts.map((candidate) => ({ value: candidate.id, label: candidate.displayName }))} value={host?.id ?? viewer.id} onChange={setHostId} last />
          </Group>
        )}
        <Group>
          <SelectRow label="Kind" options={Object.entries(EVENT_CATEGORIES).map(([value, label]) => ({ value: categoryOf(value), label }))} value={form.category} onChange={(category) => set("category", category)} />
          <SelectRow label="Time zone" options={AU_TIMEZONES.map((zone) => ({ value: zone.value, label: zone.label }))} value={form.timezone} onChange={(zone) => set("timezone", zoneOf(zone))} last />
        </Group>
        <Segmented label="Format" options={FORMATS} value={form.format} onChange={(format) => set("format", formatOf(format))} />
        <DateField label="Starts" value={form.startsAt} onChange={(when) => set("startsAt", when)} timeZone={form.timezone} minimumDate={editing ? undefined : new Date()} />
        <DateField label="Ends (optional)" value={form.endsAt} onChange={(when) => set("endsAt", when)} timeZone={form.timezone} minimumDate={form.startsAt ?? new Date()} optional />
        {form.format === "online" ? null : (
          <>
            <Group>
              <SelectRow label="City" options={cities.map((city) => ({ value: city.id, label: `${city.name}, ${city.state}` }))} value={form.cityId} onChange={(cityId) => set("cityId", cityId)} last />
            </Group>
            <TextField {...field("venue")} label="Venue" value={form.venue} onChangeText={(text) => set("venue", text)} maxLength={120} placeholder="Acacia Ridge Community Centre" />
            <TextField {...field("address")} label="Address" value={form.address} onChangeText={(text) => set("address", text)} maxLength={200} />
          </>
        )}
        {form.format === "in_person" ? null : (
          <TextField {...field("onlineUrl")} label="Link to join online" hint="Only people who say they're going see it." value={form.onlineUrl} onChangeText={(text) => set("onlineUrl", text)} keyboardType="url" autoCapitalize="none" autoCorrect={false} placeholder="https://" />
        )}
        <View style={{ borderRadius: 14, overflow: "hidden", backgroundColor: palette.surface }}>
          <ToggleRow label="Free" value={form.free} onChange={(free) => set("free", free)} last />
        </View>
        <TextField {...field("ticketUrl")} label={form.free ? "Registration link (optional)" : "Tickets link"} value={form.ticketUrl} onChangeText={(text) => set("ticketUrl", text)} keyboardType="url" autoCapitalize="none" autoCorrect={false} placeholder="https://" />
        <TextField {...field("capacity")} label="Places (optional)" value={form.capacity} onChangeText={(text) => set("capacity", text.replace(/\D/g, ""))} keyboardType="number-pad" maxLength={6} />
        {spaces.length > 0 ? (
          <Group>
            <SelectRow label="Space" options={[{ value: "", label: "No space" }, ...spaces.map((space) => ({ value: space.id, label: space.name }))]} value={form.spaceId ?? ""} onChange={(spaceId) => set("spaceId", spaceId || null)} last />
          </Group>
        ) : null}
        <TextField label="Description" value={form.description} onChangeText={(text) => set("description", text)} maxLength={4000} limit={4000} multiline placeholder="What's happening, who it's for, what to bring" />
        <Text variant="small" tone="muted">
          Gatherings belong under Events (rule 5). New members' events may be checked by a moderator before they show.
        </Text>
      </ScrollView>
      {rules.sheet}
    </KeyboardSheet>
  );
}
