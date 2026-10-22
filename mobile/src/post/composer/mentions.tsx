import { useEffect, useState } from "react";
import { Pressable, View } from "react-native";
import type { PersonSummary } from "@/lib/domain";
import { mentionSuggestions } from "@/data/posts";
import { Avatar } from "@/ui/avatar";
import { Text } from "@/ui/text";
import { HAIRLINE, usePalette } from "@/ui/theme";

// The handle being typed at the caret, as the website's mentions.tsx finds it.
const TYPING = /(?:^|[^A-Za-z0-9_@])@([A-Za-z0-9_]{0,30})$/;

export function mentionAt(body: string, caret: number) {
  const before = body.slice(0, caret);
  const match = TYPING.exec(before);
  if (!match || match[1] === undefined) return null;
  return { query: match[1], start: caret - match[1].length - 1, end: caret };
}

export function useMentionSuggestions(query: string | null, context: { replyTo: string | null; quoteOf: string | null }) {
  const [found, setFound] = useState<{ query: string; people: PersonSummary[] }>({ query: "", people: [] });
  const { replyTo, quoteOf } = context;
  useEffect(() => {
    if (query === null) return;
    let current = true;
    // Asked after a short pause, so typing a name doesn't send a request per letter.
    const timer = setTimeout(() => {
      void mentionSuggestions(query, { replyTo, quoteOf }).then((people) => {
        if (current) setFound({ query, people });
      });
    }, 150);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [query, replyTo, quoteOf]);
  return query !== null && found.query === query ? found.people : [];
}

export function MentionList({ people, onPick }: { people: PersonSummary[]; onPick: (person: PersonSummary) => void }) {
  const palette = usePalette();
  if (people.length === 0) return null;
  return (
    <View accessibilityRole="list" accessibilityLabel="People to mention" style={{ borderTopWidth: HAIRLINE, borderTopColor: palette.hairline, backgroundColor: palette.popover }}>
      {people.map((person) => (
        <Pressable
          key={person.id}
          accessibilityRole="button"
          accessibilityLabel={`Mention ${person.displayName}, @${person.username}`}
          onPress={() => onPick(person)}
          style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 10, minHeight: 52, paddingHorizontal: 16, backgroundColor: pressed ? palette.wash : "transparent" })}
        >
          <Avatar person={person} size={32} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text variant="name" numberOfLines={1}>
              {person.displayName}
            </Text>
            <Text variant="meta" tone="muted" numberOfLines={1}>
              @{person.username}
            </Text>
          </View>
        </Pressable>
      ))}
    </View>
  );
}
