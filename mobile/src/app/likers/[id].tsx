import { router, useLocalSearchParams } from "expo-router";
import { Heart } from "lucide-react-native";
import { View } from "react-native";
import { z } from "zod";
import { loadLikers } from "@/data/posts";
import { useList } from "@/data/use-list";
import { PersonRow } from "@/people/person-row";
import { EmptyState } from "@/ui/controls";
import { SheetHeader } from "@/ui/form";
import { PagedList } from "@/ui/list";
import { Text } from "@/ui/text";
import { usePalette } from "@/ui/theme";

// Who liked your post. Only the author sees this, as on the website.
export default function Likers() {
  const palette = usePalette();
  const postId = z.uuid().safeParse(useLocalSearchParams().id).data ?? "";
  const list = useList((cursor) => loadLikers(postId, cursor).then((page) => ({ items: page.people, next: page.next })), `likers:${postId}`, { enabled: postId !== "" });
  return (
    <View style={{ flex: 1, backgroundColor: palette.surface }}>
      <SheetHeader title="Liked by" onCancel={() => router.back()} cancelLabel="Done" />
      <Text variant="small" tone="muted" style={{ paddingHorizontal: 16, paddingBottom: 8 }}>
        Only you can see this.
      </Text>
      <PagedList list={list} renderItem={({ item }) => <PersonRow person={item} />} empty={<EmptyState icon={<Heart size={26} color={palette.inkMuted} />} title="No likes yet" />} />
    </View>
  );
}
