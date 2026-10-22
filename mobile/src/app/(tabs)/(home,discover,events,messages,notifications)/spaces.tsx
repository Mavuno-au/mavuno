import { router } from "expo-router";
import { Plus, Users } from "lucide-react-native";
import { useState } from "react";
import { View } from "react-native";
import type { SpaceListItem, SpaceTab } from "@/lib/community";
import { loadSpaces } from "@/data/community";
import { useViewer } from "@/data/session";
import { useList } from "@/data/use-list";
import { SpaceRow } from "@/community/space-card";
import { Button, EmptyState, IconButton, RowSkeleton, Segmented } from "@/ui/controls";
import { BackButton, Header } from "@/ui/header";
import { PagedList } from "@/ui/list";
import { HAIRLINE, usePalette } from "@/ui/theme";

// The website's Spaces: Cities, Interests and the ones you've joined.
export default function Spaces() {
  const palette = usePalette();
  const viewer = useViewer();
  const [tab, setTab] = useState<SpaceTab>("city");
  const list = useList<SpaceListItem>(async () => ({ items: viewer ? await loadSpaces(tab, viewer.id) : [], next: null }), `spaces:${tab}`, { enabled: viewer !== null });
  return (
    <View style={{ flex: 1, backgroundColor: palette.surface }}>
      <Header
        title="Spaces"
        border={false}
        left={<BackButton fallback="/discover" />}
        right={
          <IconButton label="Start a space" onPress={() => router.push("/space-form")}>
            <Plus size={20} color={palette.ink} />
          </IconButton>
        }
      />
      <View style={{ paddingHorizontal: 16, paddingBottom: 8, borderBottomWidth: HAIRLINE, borderBottomColor: palette.hairline }}>
        <Segmented
          label="Spaces"
          options={[
            { key: "city", label: "Cities" },
            { key: "interest", label: "Interests" },
            { key: "joined", label: "Joined" },
          ]}
          value={tab}
          onChange={setTab}
        />
      </View>
      <PagedList
        list={list}
        renderItem={({ item }) => <SpaceRow space={item} />}
        skeleton={<RowSkeleton leading="square" label="Loading spaces" />}
        empty={
          tab === "joined" ? (
            <EmptyState icon={<Users size={26} color={palette.inkMuted} />} title="You haven't joined a space yet" action={<Button label="Browse cities" size="medium" onPress={() => setTab("city")} />}>
              Join your city's space to hear what's on near you.
            </EmptyState>
          ) : (
            <EmptyState icon={<Users size={26} color={palette.inkMuted} />} title="No spaces yet" action={<Button label="Start a space" size="medium" onPress={() => router.push("/space-form")} />} />
          )
        }
      />
    </View>
  );
}
