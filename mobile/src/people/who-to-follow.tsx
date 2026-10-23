import { router } from "expo-router";
import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { LayoutAnimation, View } from "react-native";
import { SUGGESTIONS_PER_PAGE } from "@/lib/who-to-follow";
import type { PersonSummary } from "@/lib/domain";
import { dismissSuggestion, loadSuggestions } from "@/data/community";
import { setPreference } from "@/data/preferences";
import { PersonRow } from "@/people/person-row";
import { Text } from "@/ui/text";
import { HAIRLINE, usePalette } from "@/ui/theme";
import { toast } from "@/ui/toast";
import { useReduceMotion } from "@/util/motion";

type Suggestions = { people: PersonSummary[] | null; hidden: ReadonlySet<string>; setHidden: Dispatch<SetStateAction<ReadonlySet<string>>> };

// Read once by Home for both Following and Latest. The block's cell remounts
// as it scrolls out of the list's window and back, and mustn't fetch and
// reshuffle each time, or bring back who Not for me hid.
export function useSuggestions(viewerId: string | null): Suggestions {
  const [people, setPeople] = useState<PersonSummary[] | null>(null);
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set());

  useEffect(() => {
    if (!viewerId) return;
    let current = true;
    loadSuggestions(SUGGESTIONS_PER_PAGE * 2).then(
      (loaded) => current && setPeople(loaded),
      () => current && setPeople([]),
    );
    return () => {
      current = false;
    };
  }, [viewerId]);

  return useMemo(() => ({ people, hidden, setHidden }), [people, hidden]);
}

// The website's Who to follow block, after the fifth post of Following and
// Latest. Twice as many are read as shown, so Not for me fills the gap from
// the spares, as the website's does.
export function WhoToFollow({ viewerId, suggestions: { people, hidden, setHidden } }: { viewerId: string; suggestions: Suggestions }) {
  const palette = usePalette();
  const reduceMotion = useReduceMotion();

  const shown = (people ?? []).filter((person) => !hidden.has(person.id)).slice(0, SUGGESTIONS_PER_PAGE);
  if (shown.length === 0) return null;

  const hide = (id: string, on: boolean) => {
    if (!reduceMotion) LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setHidden((current) => (on ? new Set([...current, id]) : new Set([...current].filter((other) => other !== id))));
  };
  const notForMe = (person: PersonSummary) => {
    hide(person.id, true);
    const hiding = dismissSuggestion(viewerId, person.id, true).then((result) => {
      if (result.ok) return true;
      hide(person.id, false);
      toast(`Couldn't hide them. ${result.error}`, { tone: "error" });
      return false;
    });
    const undo = () => {
      hide(person.id, false);
      void hiding.then(async (hid) => {
        if (!hid) return;
        const result = await dismissSuggestion(viewerId, person.id, false);
        if (!result.ok) hide(person.id, true);
      });
    };
    toast("We won't suggest them again", { action: { label: "Undo", onPress: undo } });
  };
  const hideBlock = () => {
    setPreference("whoToFollow", false);
    toast("Who to follow is hidden. Bring it back in Settings, Appearance.", { action: { label: "Undo", onPress: () => setPreference("whoToFollow", true) } });
  };

  return (
    <View style={{ paddingTop: 12, paddingBottom: 8, borderBottomWidth: HAIRLINE, borderBottomColor: palette.hairline }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, minHeight: 32 }}>
        <Text variant="label" accessibilityRole="header">
          Who to follow
        </Text>
        <Text variant="subhead" tone="muted" accessibilityRole="button" onPress={hideBlock} style={{ paddingVertical: 6 }}>
          Hide
        </Text>
      </View>
      {shown.map((person) => (
        <PersonRow key={person.id} person={person} detail={person.reason ?? undefined} onDismiss={() => notForMe(person)} />
      ))}
      <Text variant="subhead" tone="primary" accessibilityRole="link" onPress={() => router.navigate("/discover")} style={{ paddingHorizontal: 16, paddingVertical: 8 }}>
        See more people
      </Text>
    </View>
  );
}
