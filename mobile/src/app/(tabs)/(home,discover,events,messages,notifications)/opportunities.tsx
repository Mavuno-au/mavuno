import { router } from "expo-router";
import { Briefcase, Plus } from "lucide-react-native";
import { useEffect, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { OPPORTUNITY_TYPES } from "@/lib/catalogue";
import type { Opportunity } from "@/lib/community";
import type { OpportunityType } from "@/lib/domain";
import { loadOpportunities } from "@/data/community";
import { loadCities, type City } from "@/data/profiles";
import { useList } from "@/data/use-list";
import { OpportunityRow } from "@/community/opportunity-row";
import { Button, EmptyState, IconButton } from "@/ui/controls";
import { Group, SelectRow, ToggleRow } from "@/ui/form";
import { BackButton, Header } from "@/ui/header";
import { PagedList } from "@/ui/list";
import { font, Text } from "@/ui/text";
import { usePalette } from "@/ui/theme";

const TYPES = Object.entries(OPPORTUNITY_TYPES).flatMap(([value, type]) => {
  const key = Object.keys(OPPORTUNITY_TYPES).find((candidate): candidate is OpportunityType => candidate === value);
  return key ? [{ value: key, label: type.plural }] : [];
});

// The seven types are a scrolling row of chips; the city filter is a native menu.
export default function Opportunities() {
  const palette = usePalette();
  const [type, setType] = useState<OpportunityType | null>(null);
  const [cityId, setCityId] = useState<number>(0);
  const [remote, setRemote] = useState(false);
  const [cities, setCities] = useState<City[]>([]);
  const list = useList<Opportunity>(async () => ({ items: await loadOpportunities({ type, cityId: cityId || null, remote }), next: null }), `opportunities:${type ?? ""}:${cityId}:${remote}`);

  useEffect(() => {
    void loadCities()
      .then(setCities)
      .catch(() => setCities([]));
  }, []);

  const chip = (label: string, selected: boolean, onPress: () => void) => (
    <Pressable
      key={label}
      accessibilityRole="tab"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={{ minHeight: 36, paddingHorizontal: 14, borderRadius: 18, justifyContent: "center", backgroundColor: selected ? palette.ink : palette.wash }}
    >
      <Text variant="subhead" style={{ fontFamily: selected ? font.semibold : font.medium, color: selected ? palette.surface : palette.ink }}>
        {label}
      </Text>
    </Pressable>
  );

  return (
    <View style={{ flex: 1, backgroundColor: palette.surface }}>
      <Header
        title="Opportunities"
        left={<BackButton fallback="/discover" />}
        right={
          <IconButton label="Post an opportunity" onPress={() => router.push("/opportunity-form")}>
            <Plus size={20} color={palette.ink} />
          </IconButton>
        }
      />
      <View style={{ borderBottomWidth: 1, borderBottomColor: palette.hairline }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 16, paddingVertical: 8 }} accessibilityRole="tablist">
          {chip("All", type === null, () => setType(null))}
          {TYPES.map((option) => chip(option.label, type === option.value, () => setType(option.value)))}
        </ScrollView>
      </View>
      <PagedList
        list={list}
        header={
          <View style={{ padding: 16 }}>
            <Group>
              <SelectRow label="City" options={[{ value: 0, label: "Anywhere" }, ...cities.map((city) => ({ value: city.id, label: city.name }))]} value={cityId} onChange={setCityId} />
              <ToggleRow label="Remote only" value={remote} onChange={setRemote} last />
            </Group>
          </View>
        }
        renderItem={({ item }) => <OpportunityRow opportunity={item} />}
        empty={
          <EmptyState icon={<Briefcase size={26} color={palette.inkMuted} />} title="No open opportunities" action={<Button label="Post an opportunity" size="medium" onPress={() => router.push("/opportunity-form")} />}>
            Jobs, internships, scholarships, grants, mentoring, business and volunteering show here.
          </EmptyState>
        }
      />
    </View>
  );
}
