import { useLocalSearchParams } from "expo-router";
import { Search, Users } from "lucide-react-native";
import { useEffect, useState } from "react";
import { ActivityIndicator, TextInput, View } from "react-native";
import { z } from "zod";
import { usernameSchema } from "@/lib/schemas";
import { reasonOf, type Reason } from "@/data/errors";
import { loadConnections, loadProfile, type Direction } from "@/data/profiles";
import { useViewer } from "@/data/session";
import { useList } from "@/data/use-list";
import { PersonRow } from "@/people/person-row";
import { EmptyState, LoadFailed, Segmented } from "@/ui/controls";
import { BackButton, Header } from "@/ui/header";
import { PagedList } from "@/ui/list";
import { type } from "@/ui/text";
import { HAIRLINE, usePalette } from "@/ui/theme";

type Target = { kind: "loading" } | { kind: "failed"; reason: Reason } | { kind: "missing" } | { kind: "unavailable" } | { kind: "ready"; id: string; name: string };

// Followers and following on one screen, with a switch between the two and a search box.
export default function Connections() {
  const palette = usePalette();
  const viewer = useViewer();
  const params = useLocalSearchParams();
  const username = usernameSchema.safeParse(params.username).data ?? null;
  const [direction, setDirection] = useState<Direction>(z.enum(["followers", "following"]).catch("followers").parse(params.direction));
  const [search, setSearch] = useState("");
  const [loaded, setLoaded] = useState<{ username: string | null; target: Target }>({ username: null, target: { kind: "loading" } });
  const [attempt, setAttempt] = useState(0);
  // Not the viewer object: the session rebuilds it on every return to the app.
  const viewerId = viewer?.id ?? null;

  useEffect(() => {
    if (!username || !viewerId) return;
    let current = true;
    loadProfile(username, viewerId).then(
      (page) => current && setLoaded({ username, target: page.kind === "profile" ? { kind: "ready", id: page.profile.id, name: page.profile.display_name } : { kind: page.kind } }),
      (error: unknown) => current && setLoaded({ username, target: { kind: "failed", reason: reasonOf(error) } }),
    );
    return () => {
      current = false;
    };
  }, [username, viewerId, attempt]);

  const target: Target = !username ? { kind: "missing" } : loaded.username === username ? loaded.target : { kind: "loading" };
  const profileId = target.kind === "ready" ? target.id : "";
  const list = useList((cursor) => loadConnections(profileId, direction, cursor), `${profileId}:${direction}`, { enabled: profileId !== "" });
  const term = search.trim().toLowerCase();
  // A search filters the pages already here. Paging on as the filtered list
  // comes up short would load every follower in the background.
  const shown =
    list.state.kind === "ready" && term
      ? { ...list, loadMore: () => {}, state: { ...list.state, items: list.state.items.filter((person) => person.displayName.toLowerCase().includes(term) || person.username.includes(term)) } }
      : list;

  return (
    <View style={{ flex: 1, backgroundColor: palette.surface }}>
      <Header title={target.kind === "ready" ? target.name : username ? `@${username}` : "People"} left={<BackButton />} border={false} />
      <View style={{ paddingHorizontal: 16, paddingBottom: 8, gap: 8, borderBottomWidth: HAIRLINE, borderBottomColor: palette.hairline }}>
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
      {target.kind === "failed" ? (
        <LoadFailed
          title="These people didn't load"
          reason={target.reason}
          onRetry={() => {
            setLoaded({ username: null, target: { kind: "loading" } });
            setAttempt((count) => count + 1);
          }}
        />
      ) : target.kind === "missing" || target.kind === "unavailable" ? (
        <EmptyState icon={<Users size={26} color={palette.inkMuted} />} title="This profile isn't available" />
      ) : target.kind === "loading" ? (
        <ActivityIndicator style={{ marginTop: 32 }} color={palette.inkMuted} accessibilityLabel="Loading" />
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
