import { Image } from "expo-image";
import { router, useLocalSearchParams } from "expo-router";
import { Camera, Plus, X } from "lucide-react-native";
import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, View } from "react-native";
import { z } from "zod";
import { COLOURS, LIMITS } from "@/lib/catalogue";
import { INTEREST_CHOICES, knownInterests, knownOpenTo, OPEN_TO_CHOICES, type Interest, type OpenTo } from "@/lib/choices";
import { colourSchema, type Colour } from "@/lib/domain";
import { loadCities, loadEditableProfile, setProfileImage, updateProfile, type City, type EditableProfile } from "@/data/profiles";
import { MEDIA_URL } from "@/data/posts";
import { reloadViewer } from "@/data/session";
import { pickImages, uploadImage } from "@/data/upload";
import { Avatar } from "@/ui/avatar";
import { ChipPicker, FieldError, Group, KeyboardSheet, SelectRow, SheetHeader, TextField, useErrorScroll, useReturnChain } from "@/ui/form";
import { ActionSheet } from "@/ui/sheet";
import { font, Text } from "@/ui/text";
import { identityColour, usePalette } from "@/ui/theme";
import { toast } from "@/ui/toast";
import { emitProfileChanged } from "@/util/events";

type Form = {
  displayName: string;
  bio: string;
  cityId: number | null;
  heritage: string;
  pronouns: string;
  website: string;
  interests: Interest[];
  links: { label: string; url: string }[];
  headline: string;
  occupation: string;
  company: string;
  industry: string;
  openTo: OpenTo[];
  category: string;
  colour: Colour | null;
};

const formOf = (profile: EditableProfile): Form => ({
  displayName: profile.displayName,
  bio: profile.bio,
  cityId: profile.cityId,
  heritage: profile.heritage,
  pronouns: profile.pronouns,
  website: profile.website,
  interests: knownInterests(profile.interests),
  links: profile.links,
  headline: profile.headline,
  occupation: profile.occupation,
  company: profile.company,
  industry: profile.industry,
  openTo: knownOpenTo(profile.openTo),
  category: profile.category,
  colour: profile.colour,
});

// The website's profile form (src/components/settings/profile-form.tsx) as a
// sheet with Cancel and Save, in its order: photo and banner, name, bio,
// city, pronouns, heritage, colour, then work, Open to, interests and links.
export default function EditProfile() {
  const palette = usePalette();
  const profileId = z.uuid().safeParse(useLocalSearchParams().id).data ?? null;
  const [loaded, setLoaded] = useState<{ profile: EditableProfile; cities: City[] } | null | "loading">("loading");
  const [form, setForm] = useState<Form | null>(null);

  useEffect(() => {
    if (!profileId) return;
    let current = true;
    void Promise.all([loadEditableProfile(profileId), loadCities().catch(() => [])])
      .then(([profile, cities]) => {
        if (!current) return;
        setLoaded(profile ? { profile, cities } : null);
        if (profile) setForm(formOf(profile));
      })
      .catch(() => current && setLoaded(null));
    return () => {
      current = false;
    };
  }, [profileId]);

  if (!profileId || loaded === null) {
    return (
      <View style={{ flex: 1, backgroundColor: palette.surface }}>
        <SheetHeader title="Edit profile" onCancel={() => router.back()} cancelLabel="Close" />
        <Text variant="callout" tone="muted" style={{ padding: 24 }}>
          This profile couldn't be loaded.
        </Text>
      </View>
    );
  }
  if (loaded === "loading" || !form) {
    return (
      <View style={{ flex: 1, backgroundColor: palette.surface }}>
        <SheetHeader title="Edit profile" onCancel={() => router.back()} />
        <ActivityIndicator style={{ marginTop: 40 }} color={palette.inkMuted} accessibilityLabel="Loading" />
      </View>
    );
  }
  return <Editor profile={loaded.profile} cities={loaded.cities} initial={form} />;
}

function Editor({ profile, cities, initial }: { profile: EditableProfile; cities: City[]; initial: Form }) {
  const palette = usePalette();
  const [form, setForm] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scroll = useErrorScroll(error);
  const [images, setImages] = useState({ avatar: profile.avatarUrl, banner: profile.bannerUrl });
  const [uploading, setUploading] = useState<"avatar" | "banner" | null>(null);
  const [photoMenu, setPhotoMenu] = useState<"avatar" | "banner" | null>(null);
  const organisation = profile.accountType === "organisation";
  const field = useReturnChain([
    "name",
    "bio",
    ...(organisation ? ["category"] : ["pronouns", "heritage"]),
    "website",
    "headline",
    "occupation",
    "company",
    "industry",
    ...form.links.flatMap((_, index) => [`label-${index}`, `url-${index}`]),
  ]);
  const changed = JSON.stringify(form) !== JSON.stringify(initial);
  const set = <Key extends keyof Form>(key: Key, value: Form[Key]) => setForm((current) => ({ ...current, [key]: value }));
  const toggle = <Value extends string>(values: Value[], value: Value) => (values.includes(value) ? values.filter((other) => other !== value) : [...values, value]);

  // A new photo or banner is saved the moment it's chosen, so discarding doesn't undo it.
  const photoChanged = images.avatar !== profile.avatarUrl || images.banner !== profile.bannerUrl;

  function cancel() {
    if (!changed) return router.back();
    Alert.alert("Discard your changes?", photoChanged ? "Your other changes won't be saved. The photo you changed is already saved." : "What you changed here won't be saved.", [
      { text: "Keep editing", style: "cancel" },
      { text: "Discard", style: "destructive", onPress: () => router.back() },
    ]);
  }

  async function save() {
    setBusy(true);
    setError(null);
    const result = await updateProfile(profile.id, { ...form, links: form.links.filter((link) => link.label.trim() || link.url.trim()) });
    setBusy(false);
    if (!result.ok) return setError(result.error);
    reloadViewer();
    emitProfileChanged(profile.id);
    toast("Profile saved");
    router.back();
  }

  async function changeImage(kind: "avatar" | "banner") {
    const [picked] = await pickImages(1);
    if (!picked) return;
    setUploading(kind);
    const uploaded = await uploadImage(picked, { bucket: "media", folder: kind === "avatar" ? "avatars" : "banners", ownerId: profile.id });
    if (!uploaded.ok) {
      setUploading(null);
      return Alert.alert("The upload failed", uploaded.error);
    }
    const url = `${MEDIA_URL}${uploaded.data.path}`;
    const result = await setProfileImage(profile.id, kind, url);
    setUploading(null);
    if (!result.ok) return Alert.alert("Couldn't change the photo", result.error);
    setImages((current) => ({ ...current, [kind]: url }));
    reloadViewer();
    emitProfileChanged(profile.id);
  }

  async function removeImage(kind: "avatar" | "banner") {
    setUploading(kind);
    const result = await setProfileImage(profile.id, kind, null);
    setUploading(null);
    if (!result.ok) return Alert.alert("Couldn't remove the photo", result.error);
    setImages((current) => ({ ...current, [kind]: null }));
    reloadViewer();
    emitProfileChanged(profile.id);
  }

  const person = { displayName: form.displayName || profile.displayName, avatarUrl: images.avatar, colour: form.colour ?? profile.effectiveColour, accountType: profile.accountType };
  const cityOptions = [{ value: 0, label: "No city" }, ...cities.map((city) => ({ value: city.id, label: `${city.name}, ${city.state}` }))];

  return (
    <KeyboardSheet style={{ flex: 1, backgroundColor: palette.shell }}>
      <SheetHeader title={organisation ? `Edit ${profile.displayName}` : "Edit profile"} onCancel={cancel} action={{ label: "Save", onPress: () => void save(), disabled: !changed, busy }} />
      <ScrollView ref={scroll} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 48, gap: 22 }}>
        <View>
          <Pressable accessibilityRole="button" accessibilityLabel="Change banner" onPress={() => setPhotoMenu("banner")} style={{ height: 120, backgroundColor: palette.wash, alignItems: "center", justifyContent: "center" }}>
            {images.banner ? <Image source={images.banner} style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0 }} contentFit="cover" /> : null}
            {uploading === "banner" ? <ActivityIndicator color={palette.inkMuted} /> : <Camera size={22} color={palette.inkMuted} />}
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Change photo" onPress={() => setPhotoMenu("avatar")} style={{ marginTop: -36, marginLeft: 16, alignSelf: "flex-start" }}>
            <View style={{ borderRadius: 48, borderWidth: 4, borderColor: palette.shell }}>
              <Avatar person={person} size={84} />
            </View>
            <View style={{ position: "absolute", right: 0, bottom: 4, width: 30, height: 30, borderRadius: 15, backgroundColor: palette.primary, alignItems: "center", justifyContent: "center" }}>
              {uploading === "avatar" ? <ActivityIndicator color={palette.primaryInk} /> : <Camera size={16} color={palette.primaryInk} />}
            </View>
          </Pressable>
        </View>

        <View style={{ paddingHorizontal: 16, gap: 16 }}>
          {error ? <FieldError>{error}</FieldError> : null}
          <TextField {...field("name")} label="Name" value={form.displayName} onChangeText={(text) => set("displayName", text)} maxLength={60} textContentType="name" />
          <TextField {...field("bio", { multiline: true })} label="Bio" value={form.bio} onChangeText={(text) => set("bio", text)} limit={LIMITS.bio} maxLength={LIMITS.bio + 20} multiline />
          {organisation ? <TextField {...field("category")} label="Category" hint="Church, community group, business…" value={form.category} onChangeText={(text) => set("category", text)} maxLength={60} /> : null}
        </View>

        <Group title="About">
          <SelectRow label="City" options={cityOptions} value={form.cityId ?? 0} onChange={(cityId) => set("cityId", cityId === 0 ? null : cityId)} placeholder="Choose" />
          <View style={{ padding: 16, gap: 16 }}>
            <Text variant="small" tone="muted">
              Only your city is ever shown.
            </Text>
            {organisation ? null : <TextField {...field("pronouns")} label="Pronouns" value={form.pronouns} onChangeText={(text) => set("pronouns", text)} maxLength={30} />}
            {organisation ? null : <TextField {...field("heritage")} label="Heritage" hint="Optional, in your own words." value={form.heritage} onChangeText={(text) => set("heritage", text)} maxLength={60} />}
            <TextField {...field("website")} label="Website" value={form.website} onChangeText={(text) => set("website", text)} keyboardType="url" autoCapitalize="none" autoCorrect={false} placeholder="https://" />
          </View>
        </Group>

        <View style={{ paddingHorizontal: 16, gap: 10 }}>
          <Text variant="label" style={{ fontSize: 14 }}>
            Colour
          </Text>
          <View accessibilityRole="radiogroup" style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
            {COLOURS.map((name, index) => {
              const colour = colourSchema.parse(index);
              const selected = form.colour === colour;
              return (
                <Pressable
                  key={name}
                  accessibilityRole="radio"
                  accessibilityLabel={name}
                  accessibilityState={{ selected }}
                  onPress={() => set("colour", colour)}
                  style={{ width: 44, height: 44, borderRadius: 22, borderWidth: selected ? 3 : 0, borderColor: palette.ink, alignItems: "center", justifyContent: "center" }}
                >
                  <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: identityColour(palette, colour) }} />
                </Pressable>
              );
            })}
            <Pressable accessibilityRole="radio" accessibilityState={{ selected: form.colour === null }} onPress={() => set("colour", null)} style={{ minHeight: 44, justifyContent: "center", paddingHorizontal: 6 }}>
              <Text variant="subhead" tone={form.colour === null ? "primary" : "muted"} style={{ fontFamily: font.medium }}>
                Automatic
              </Text>
            </Pressable>
          </View>
        </View>

        <View style={{ paddingHorizontal: 16, gap: 16 }}>
          <Text variant="heading" accessibilityRole="header">
            Work
          </Text>
          <TextField {...field("headline")} label="Headline" value={form.headline} onChangeText={(text) => set("headline", text)} maxLength={100} placeholder="Nurse and mentor, Logan" />
          <TextField {...field("occupation")} label="Occupation" value={form.occupation} onChangeText={(text) => set("occupation", text)} maxLength={80} />
          <TextField {...field("company")} label="Company" value={form.company} onChangeText={(text) => set("company", text)} maxLength={80} />
          <TextField {...field("industry")} label="Industry" value={form.industry} onChangeText={(text) => set("industry", text)} maxLength={60} />
          <ChipPicker label="Open to" options={OPEN_TO_CHOICES} selected={form.openTo} onToggle={(value) => set("openTo", toggle(form.openTo, value))} />
          <ChipPicker label="Interests" options={INTEREST_CHOICES} selected={form.interests} onToggle={(value) => set("interests", toggle(form.interests, value))} max={15} />
        </View>

        <View style={{ paddingHorizontal: 16, gap: 12 }}>
          <Text variant="heading" accessibilityRole="header">
            Links
          </Text>
          {form.links.map((link, index) => (
            <View key={index} style={{ gap: 8, padding: 12, borderRadius: 12, backgroundColor: palette.surface }}>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                <Text variant="label" style={{ fontSize: 14 }}>
                  Link {index + 1}
                </Text>
                <Pressable accessibilityRole="button" accessibilityLabel={`Remove link ${index + 1}`} onPress={() => set("links", form.links.filter((_, at) => at !== index))} style={{ width: 44, height: 44, alignItems: "flex-end", justifyContent: "center" }}>
                  <X size={18} color={palette.inkMuted} />
                </Pressable>
              </View>
              <TextField {...field(`label-${index}`)} label="Label" value={link.label} onChangeText={(label) => set("links", form.links.map((other, at) => (at === index ? { ...other, label } : other)))} maxLength={40} />
              <TextField {...field(`url-${index}`)} label="Address" value={link.url} onChangeText={(url) => set("links", form.links.map((other, at) => (at === index ? { ...other, url } : other)))} keyboardType="url" autoCapitalize="none" autoCorrect={false} placeholder="https://" />
            </View>
          ))}
          {form.links.length < 5 ? (
            <Pressable accessibilityRole="button" onPress={() => set("links", [...form.links, { label: "", url: "" }])} style={{ flexDirection: "row", alignItems: "center", gap: 6, minHeight: 44 }}>
              <Plus size={18} color={palette.primary} />
              <Text variant="callout" tone="primary" style={{ fontFamily: font.medium }}>
                Add a link
              </Text>
            </Pressable>
          ) : null}
        </View>
      </ScrollView>
      <ActionSheet
        title={photoMenu === "banner" ? "Banner" : "Profile photo"}
        open={photoMenu !== null}
        onClose={() => setPhotoMenu(null)}
        actions={
          photoMenu
            ? [
                { label: "Choose a photo", onPress: () => void changeImage(photoMenu) },
                ...(images[photoMenu] ? [{ label: "Remove photo", destructive: true, onPress: () => void removeImage(photoMenu) }] : []),
              ]
            : []
        }
      />
    </KeyboardSheet>
  );
}
