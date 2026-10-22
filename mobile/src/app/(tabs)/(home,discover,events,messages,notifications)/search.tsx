import { router, useLocalSearchParams } from "expo-router";
import { Search as SearchIcon, X } from "lucide-react-native";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, TextInput, View } from "react-native";
import { z } from "zod";
import type { PersonSummary } from "@/lib/domain";
import { searchPeople } from "@/data/community";
import { loadFeed } from "@/data/posts";
import { useFeed } from "@/data/use-feed";
import { PersonRow } from "@/people/person-row";
import { FeedList } from "@/post/feed-list";
import { EmptyState, Segmented } from "@/ui/controls";
import { BackButton } from "@/ui/header";
import { font, Text, type } from "@/ui/text";
import { usePalette } from "@/ui/theme";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type Tab = "all" | "people" | "posts";

// The website's search: people first, then posts, ranked by relevance and
// freshness. Posts need at least 3 characters.
export default function Search() {
  const palette = usePalette();
  const insets = useSafeAreaInsets();
  const initial = z.string().max(100).catch("").parse(useLocalSearchParams().q ?? "");
  const [text, setText] = useState(initial);
  const [query, setQuery] = useState(initial.trim());
  const [tab, setTab] = useState<Tab>("all");
  const [people, setPeople] = useState<{ query: string; people: PersonSummary[] } | null>(null);

  // Searched as the reader types, after a short pause.
  useEffect(() => {
    const timer = setTimeout(() => setQuery(text.trim()), 350);
    return () => clearTimeout(timer);
  }, [text]);

  useEffect(() => {
    if (!query) return;
    let current = true;
    void searchPeople(query, 30)
      .then((found) => current && setPeople({ query, people: found }))
      .catch(() => current && setPeople({ query, people: [] }));
    return () => {
      current = false;
    };
  }, [query]);

  const postsReady = query.length >= 3;
  const posts = useFeed((cursor) => loadFeed({ kind: "search", query }, cursor), `search:${query}`, { enabled: postsReady });
  const found = people?.query === query ? people.people : null;
  const shownPeople = tab === "all" ? (found ?? []).slice(0, 3) : (found ?? []);

  const peopleBlock = (
    <View>
      {query && found === null ? <ActivityIndicator style={{ paddingVertical: 16 }} color={palette.inkMuted} accessibilityLabel="Loading" /> : null}
      {found && found.length === 0 && tab === "people" ? <EmptyState title={`No people match “${query}”`}>Try their name or username.</EmptyState> : null}
      {shownPeople.map((person) => (
        <PersonRow key={person.id} person={person} />
      ))}
      {tab === "all" && found && found.length > 3 ? (
        <Pressable accessibilityRole="button" onPress={() => setTab("people")} style={{ minHeight: 48, paddingHorizontal: 16, justifyContent: "center", borderBottomWidth: 1, borderBottomColor: palette.hairline }}>
          <Text variant="subhead" tone="primary" style={{ fontFamily: font.medium }}>
            See all {found.length} people
          </Text>
        </Pressable>
      ) : null}
      {tab === "all" && postsReady ? (
        <Text variant="small" tone="muted" accessibilityRole="header" style={{ fontFamily: font.semibold, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 4 }}>
          Posts
        </Text>
      ) : null}
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: palette.surface }}>
      <View style={{ paddingTop: insets.top, backgroundColor: palette.surface }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 16, minHeight: 52 }}>
          <BackButton fallback="/discover" />
          <View style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 8, minHeight: 44, paddingHorizontal: 12, borderRadius: 12, backgroundColor: palette.wash }}>
            <SearchIcon size={17} color={palette.inkMuted} />
            <TextInput
              accessibilityLabel="Search"
              placeholder="Search people and posts"
              placeholderTextColor={palette.inkMuted}
              value={text}
              onChangeText={setText}
              onSubmitEditing={() => setQuery(text.trim())}
              autoFocus={!initial}
              autoCorrect={false}
              autoCapitalize="none"
              returnKeyType="search"
              style={[type.body, { flex: 1, minHeight: 44, color: palette.ink }]}
            />
            {text ? (
              <Pressable accessibilityRole="button" accessibilityLabel="Clear search" onPress={() => setText("")} style={{ width: 44, height: 44, marginRight: -12, alignItems: "center", justifyContent: "center" }}>
                <X size={16} color={palette.inkMuted} />
              </Pressable>
            ) : null}
          </View>
        </View>
        {query ? (
          <View style={{ paddingHorizontal: 16, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: palette.hairline }}>
            <Segmented
              label="Results"
              options={[
                { key: "all", label: "Top" },
                { key: "people", label: "People" },
                { key: "posts", label: "Posts" },
              ]}
              value={tab}
              onChange={setTab}
            />
          </View>
        ) : null}
      </View>
      {!query ? (
        <EmptyState icon={<SearchIcon size={26} color={palette.inkMuted} />} title="Search Mavuno">
          Find people, organisations and posts. Topics start with #.
        </EmptyState>
      ) : tab === "people" ? (
        <View style={{ flex: 1 }}>{peopleBlock}</View>
      ) : !postsReady ? (
        <View style={{ flex: 1 }}>
          {tab === "all" ? peopleBlock : null}
          <EmptyState title="Type at least 3 characters to search posts" />
        </View>
      ) : (
        <FeedList
          feed={posts}
          header={tab === "all" ? peopleBlock : undefined}
          showPreviews={false}
          end="No more results."
          empty={
            <EmptyState title={`No posts match “${query}”`}>Try fewer or different words.</EmptyState>
          }
        />
      )}
      {query.startsWith("#") && query.length > 2 ? (
        <Pressable
          accessibilityRole="link"
          onPress={() => router.push(`/topic/${query.slice(1).toLowerCase()}`)}
          style={{ position: "absolute", bottom: insets.bottom + 70, alignSelf: "center", minHeight: 40, paddingHorizontal: 16, borderRadius: 20, justifyContent: "center", backgroundColor: palette.primary }}
        >
          <Text variant="label" tone="primaryInk">
            Open {query.toLowerCase()}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}
