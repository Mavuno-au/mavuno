import { useLocalSearchParams } from "expo-router";
import { Search, Users } from "lucide-react-native";
import { useEffect, useState } from "react";
import { ActivityIndicator, TextInput, View } from "react-native";
import { z } from "zod";
import { usernameSchema } from "@/lib/schemas";
import { loadConnections, loadProfile, type Direction } from "@/data/profiles";
import { useViewer } from "@/data/session";
import { useList } from "@/data/use-list";
import { PersonRow } from "@/people/person-row";
import { EmptyState, Segmented } from "@/ui/controls";
import { BackButton, Header } from "@/ui/header";
import { PagedList } from "@/ui/list";
import { type } from "@/ui/text";
import { usePalette } from "@/ui/theme";

// Followers and following on one screen, with a switch between the two and a search box.
export default function Connections() {
  const palette = usePalette();
  const viewer = useViewer();
  const params = useLocalSearchParams();
  const username = usernameSchema.safeParse(params.username).data ?? null;
  const [direction, setDirection] = useState<Direction>(z.enum(["followers", "following"]).catch("followers").parse(params.direction));
  const [search, setSearch] = useState("");
  const [profile, setProfile] = useState<{ username: string; id: string; name: string } | null>(null);

  useEffect(() => {
    if (!username || !viewer) return;
    let current = true;
    void loadProfile(username, viewer.id).then((page) => {
      if (current && page.kind === "profile") setProfile({ username, id: page.profile.id, name: page.profile.display_name });
    });
    return () => {
      current = false;
    };
  }, [username, viewer]);

  const profileId = profile?.username === username ? profile.id : "";
  const list = useList((cursor) => loadConnections(profileId, direction, cursor), `${profileId}:${direction}`, { enabled: profileId !== "" });
  const term = search.trim().toLowerCase();
  const shown =
    list.state.kind === "ready" && term
      ? { ...list, state: { ...list.state, items: list.state.items.filter((person) => person.displayName.toLowerCase().includes(term) || person.username.includes(term)) } }
      : list;

  return (
    <View style={{ flex: 1, backgroundColor: palette.surface }}>
      <Header title={profile?.name ?? (username ? `@${username}` : "People")} left={<BackButton />} />
      <View style={{ paddingHorizontal: 16, paddingBottom: 8, gap: 8, borderBottomWidth: 1, borderBottomColor: palette.hairline }}>
        <Segmented
          label="People"
          options={[
            { key: "followers", label: "Followers" },
            { key: "following", label: "Following" },
          ]}
          value={direction}
          onChange={setDirection}
        />
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, minHeight: 40, paddingHorizontal: 12, borderRadius: 12, backgroundColor: palette.wash }}>
          <Search size={16} color={palette.inkMuted} />
          <TextInput accessibilityLabel="Search these people" placeholder="Search" placeholderTextColor={palette.inkMuted} value={search} onChangeText={setSearch} autoCapitalize="none" autoCorrect={false} style={[type.body, { flex: 1, minHeight: 40, color: palette.ink }]} />
        </View>
      </View>
      {profileId === "" ? (
        <ActivityIndicator style={{ marginTop: 32 }} color={palette.inkMuted} />
      ) : (
        <PagedList
          list={shown}
          renderItem={({ item }) => <PersonRow person={item} />}
          empty={
            <EmptyState icon={<Users size={26} color={palette.inkMuted} />} title={term ? "No one matches that" : direction === "followers" ? "No followers yet" : "Not following anyone yet"} />
          }
        />
      )}
    </View>
  );
}
