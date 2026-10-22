import { router } from "expo-router";
import { CalendarClock } from "lucide-react-native";
import { useState } from "react";
import { Alert, Pressable, View } from "react-native";
import { count, fullDate } from "@/lib/format";
import type { ScheduledPost } from "@/lib/scheduled-posts";
import { cancelScheduledPost, loadScheduledPosts } from "@/data/posts";
import { useList } from "@/data/use-list";
import { Button, Chip, EmptyState, RowSkeleton } from "@/ui/controls";
import { BackButton, Header } from "@/ui/header";
import { PagedList } from "@/ui/list";
import { font, Text } from "@/ui/text";
import { HAIRLINE, usePalette } from "@/ui/theme";
import { toast } from "@/ui/toast";
import { timeZone } from "@/util/time";

// The website's Scheduled page: only you can see these, each with what became
// of it, and Cancel while it's waiting. Up to 10 at once, up to 30 days ahead.
export default function Scheduled() {
  const palette = usePalette();
  const list = useList(async () => ({ items: await loadScheduledPosts(), next: null }), "scheduled");
  return (
    <View style={{ flex: 1, backgroundColor: palette.surface }}>
      <Header title="Scheduled posts" left={<BackButton />} />
      <PagedList
        list={list}
        skeleton={<RowSkeleton leading="none" lines={3} label="Loading scheduled posts" />}
        header={
          <Text variant="small" tone="muted" style={{ paddingHorizontal: 16, paddingVertical: 8, borderBottomWidth: HAIRLINE, borderBottomColor: palette.hairline }}>
            Only you can see these until they go out.
          </Text>
        }
        renderItem={({ item }) => <ScheduledRow post={item} onCancelled={() => list.edit((items) => items.filter((other) => other.id !== item.id))} />}
        empty={
          <EmptyState icon={<CalendarClock size={26} color={palette.inkMuted} />} title="Nothing scheduled" action={<Button label="Write a post" size="medium" onPress={() => router.push("/compose")} />}>
            Choose Schedule for later when you write a post, and it waits here until it goes out.
          </EmptyState>
        }
      />
    </View>
  );
}

function ScheduledRow({ post, onCancelled }: { post: ScheduledPost; onCancelled: () => void }) {
  const palette = usePalette();
  const [busy, setBusy] = useState(false);
  const extras = [post.imageCount > 0 ? count(post.imageCount, "photo") : null, post.pollOptions ? "Poll" : null].filter(Boolean).join(" · ");

  const cancel = () =>
    Alert.alert("Cancel this post?", "It won't go out. You can't undo this.", [
      { text: "Keep it", style: "cancel" },
      {
        text: "Cancel post",
        style: "destructive",
        onPress: () => {
          setBusy(true);
          void cancelScheduledPost(post.id).then((result) => {
            setBusy(false);
            if (!result.ok) return Alert.alert("Couldn't cancel", result.error);
            toast("Scheduled post cancelled");
            onCancelled();
          });
        },
      },
    ]);

  const outcome = post.outcome;
  return (
    <View style={{ paddingHorizontal: 16, paddingVertical: 14, gap: 8, borderBottomWidth: HAIRLINE, borderBottomColor: palette.hairline }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <Text variant="meta" tone="muted">
          {fullDate(post.scheduledAt, timeZone)}
        </Text>
        {post.author.accountType === "organisation" ? <Chip>As {post.author.displayName}</Chip> : null}
        {outcome.kind === "queued" ? <Chip tone="primary">Waiting</Chip> : null}
        {outcome.kind === "failed" ? <Chip tone="danger">Didn't go out</Chip> : null}
        {outcome.kind === "posted" ? <Chip tone={outcome.status === "pending" ? "warning" : "muted"}>{outcome.status === "pending" ? "Posted, waiting for review" : "Posted"}</Chip> : null}
        {outcome.kind === "deleted" ? <Chip>Deleted</Chip> : null}
      </View>
      <Text variant="body" numberOfLines={6}>
        {post.body || "(No text)"}
      </Text>
      {extras ? (
        <Text variant="small" tone="muted">
          {extras}
        </Text>
      ) : null}
      {outcome.kind === "failed" ? (
        <Text variant="small" tone="destructive">
          {outcome.reason}
        </Text>
      ) : null}
      <View style={{ flexDirection: "row", gap: 16 }}>
        {outcome.kind === "queued" ? (
          <Pressable accessibilityRole="button" disabled={busy} onPress={cancel} style={{ minHeight: 36, justifyContent: "center" }}>
            <Text variant="subhead" tone="destructive" style={{ fontFamily: font.medium }}>
              {busy ? "Cancelling…" : "Cancel"}
            </Text>
          </Pressable>
        ) : null}
        {outcome.kind === "posted" ? (
          <Pressable accessibilityRole="link" onPress={() => router.push(`/post/${outcome.postId}`)} style={{ minHeight: 36, justifyContent: "center" }}>
            <Text variant="subhead" tone="primary" style={{ fontFamily: font.medium }}>
              View post
            </Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}
