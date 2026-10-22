import { Check, Search, X } from "lucide-react-native";
import { useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, ScrollView, TextInput, View } from "react-native";
import type { PersonSummary } from "@/lib/domain";
import { searchPeople } from "@/data/messages";
import { Avatar } from "@/ui/avatar";
import { Text, type } from "@/ui/text";
import { usePalette } from "@/ui/theme";

// Search people to message: one for a private chat, a few for a group.
export function PeoplePicker({ viewerId, chosen, onToggle, exclude = [] }: { viewerId: string; chosen: PersonSummary[]; onToggle: (person: PersonSummary) => void; exclude?: string[] }) {
  const palette = usePalette();
  const [query, setQuery] = useState("");
  const [found, setFound] = useState<{ query: string; people: PersonSummary[] }>({ query: "", people: [] });
  const term = query.trim();

  useEffect(() => {
    if (!term) return;
    let current = true;
    const timer = setTimeout(() => {
      void searchPeople(viewerId, term).then((people) => current && setFound({ query: term, people }));
    }, 200);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [term, viewerId]);

  const results = found.query === term ? found.people.filter((person) => !exclude.includes(person.id)) : null;
  return (
    <View style={{ flex: 1 }}>
      <View style={{ paddingHorizontal: 16, gap: 10, paddingBottom: 8 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, minHeight: 44, paddingHorizontal: 12, borderRadius: 12, backgroundColor: palette.wash }}>
          <Search size={16} color={palette.inkMuted} />
          <TextInput
            accessibilityLabel="Search people"
            placeholder="Search people"
            placeholderTextColor={palette.inkMuted}
            value={query}
            onChangeText={setQuery}
            autoFocus
            autoCorrect={false}
            autoCapitalize="none"
            style={[type.body, { flex: 1, minHeight: 44, color: palette.ink }]}
          />
        </View>
        {chosen.length > 0 ? (
          <ScrollView horizontal scrollsToTop={false} showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {chosen.map((person) => (
              <Pressable
                key={person.id}
                accessibilityRole="button"
                accessibilityLabel={`Remove ${person.displayName}`}
                onPress={() => onToggle(person)}
                style={{ flexDirection: "row", alignItems: "center", gap: 6, minHeight: 36, paddingLeft: 4, paddingRight: 10, borderRadius: 18, backgroundColor: palette.primarySoft }}
              >
                <Avatar person={person} size={28} />
                <Text variant="subhead" tone="primary">
                  {person.displayName.split(/\s+/)[0]}
                </Text>
                <X size={14} color={palette.primary} />
              </Pressable>
            ))}
          </ScrollView>
        ) : null}
      </View>
      <FlatList
        data={results ?? []}
        keyExtractor={(person) => person.id}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={
          term && results === null ? (
            <ActivityIndicator style={{ paddingVertical: 24 }} color={palette.inkMuted} accessibilityLabel="Loading" />
          ) : (
            <Text variant="subhead" tone="muted" style={{ textAlign: "center", padding: 24 }}>
              {term ? `No one matches "${term}".` : "Search by name or username."}
            </Text>
          )
        }
        renderItem={({ item }) => {
          const on = chosen.some((person) => person.id === item.id);
          return (
            <Pressable
              accessibilityRole="checkbox"
              accessibilityState={{ checked: on }}
              accessibilityLabel={`${item.displayName}, @${item.username}`}
              onPress={() => onToggle(item)}
              style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 12, minHeight: 60, paddingHorizontal: 16, backgroundColor: pressed ? palette.wash : "transparent" })}
            >
              <Avatar person={item} size={40} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text variant="name" numberOfLines={1}>
                  {item.displayName}
                </Text>
                <Text variant="meta" tone="muted" numberOfLines={1}>
                  @{item.username}
                  {item.followsYou ? " · Follows you" : ""}
                </Text>
              </View>
              <View style={{ width: 24, height: 24, borderRadius: 12, borderWidth: on ? 0 : 1.5, borderColor: palette.rail, backgroundColor: on ? palette.primary : "transparent", alignItems: "center", justifyContent: "center" }}>
                {on ? <Check size={15} color={palette.primaryInk} strokeWidth={3} /> : null}
              </View>
            </Pressable>
          );
        }}
      />
    </View>
  );
}
