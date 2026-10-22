import { Image } from "expo-image";
import { router } from "expo-router";
import { Briefcase, CalendarDays, Check } from "lucide-react-native";
import type { ReactNode } from "react";
import { Pressable, View } from "react-native";
import { OPPORTUNITY_TYPES } from "@/lib/catalogue";
import type { EventSummary, LinkPreview, OpportunitySummary, Poll, Post, PostImage, QuotedPost } from "@/lib/domain";
import { count, eventDate, pollTimeLeft, relativeTime } from "@/lib/format";
import { displayUrl } from "@/lib/text";
import { siteLink } from "@/data/env";
import { Avatar } from "@/ui/avatar";
import { font, Text } from "@/ui/text";
import { usePalette } from "@/ui/theme";
import { openLabelledLink, openLink, postLink } from "@/util/links";
import { timeZone, useNow } from "@/util/time";

// Bordered blocks are only for things embedded in a post (DESIGN.md).
function useBlock() {
  const palette = usePalette();
  return { borderWidth: 1, borderColor: palette.hairline, borderRadius: 12, overflow: "hidden" as const };
}

const imageLabel = (images: PostImage[], index: number) => images[index]?.alt || (images.length > 1 ? `Photo ${index + 1} of ${images.length}` : "Photo");

export function ImageGrid({ images }: { images: PostImage[] }) {
  const palette = usePalette();
  const block = useBlock();
  const tile = (image: PostImage, index: number) => (
    <View key={image.id} style={{ flex: 1, backgroundColor: palette.wash }} accessible accessibilityRole="image" accessibilityLabel={imageLabel(images, index)}>
      <Image source={image.url} style={{ flex: 1 }} contentFit="cover" transition={150} accessible={false} accessibilityIgnoresInvertColors />
      {image.alt ? (
        <View style={{ position: "absolute", left: 6, bottom: 6, borderRadius: 4, paddingHorizontal: 4, paddingVertical: 1, backgroundColor: "rgba(0, 0, 0, 0.7)" }}>
          <Text allowFontScaling={false} style={{ fontFamily: font.monoMedium, fontSize: 10, lineHeight: 14, color: "#ffffff" }}>
            ALT
          </Text>
        </View>
      ) : null}
    </View>
  );

  const [first, second, third, fourth] = images;
  if (!first) return null;
  if (images.length === 1) {
    // Its own shape, kept between a tall portrait and a wide panorama.
    const ratio = first.width && first.height ? Math.min(Math.max(first.width / first.height, 0.75), 2) : 16 / 10;
    return <View style={[block, { marginTop: 10, aspectRatio: ratio }]}>{tile(first, 0)}</View>;
  }
  const gap = 2;
  return (
    <View style={[block, { marginTop: 10, aspectRatio: 16 / 10, flexDirection: "row", gap }]}>
      <View style={{ flex: 1, gap }}>
        {tile(first, 0)}
        {fourth && third ? tile(third, 2) : null}
      </View>
      <View style={{ flex: 1, gap }}>
        {second ? tile(second, 1) : null}
        {fourth ? tile(fourth, 3) : third ? tile(third, 2) : null}
      </View>
    </View>
  );
}

export function LinkCard({ url, preview }: { url: string; preview: LinkPreview | null }) {
  const palette = usePalette();
  const block = useBlock();
  if (!preview) return null;
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={[preview.title, preview.siteName ?? displayUrl(url)].filter(Boolean).join(", ")}
      // A page can name any site for itself; the reader is told if that isn't where the link goes.
      onPress={() => openLabelledLink(url, preview.siteName ?? "")}
      style={({ pressed }) => [block, { marginTop: 10, backgroundColor: pressed ? palette.wash : "transparent" }]}
    >
      {preview.image ? <Image source={preview.image} style={{ aspectRatio: 1.91, backgroundColor: palette.wash }} contentFit="cover" accessible={false} /> : null}
      <View style={{ gap: 2, paddingHorizontal: 12, paddingVertical: 10 }}>
        <Text variant="caption" tone="muted" numberOfLines={1}>
          {preview.siteName ?? displayUrl(url)}
        </Text>
        {preview.title ? (
          <Text variant="callout" numberOfLines={2} style={{ fontFamily: font.medium }}>
            {preview.title}
          </Text>
        ) : null}
        {preview.description ? (
          <Text variant="subhead" tone="muted" numberOfLines={2}>
            {preview.description}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

export function QuotedBlock({ quoted }: { quoted: QuotedPost }) {
  const palette = usePalette();
  const now = useNow();
  const block = useBlock();
  if (quoted.kind !== "post") {
    return (
      <View style={[block, { marginTop: 10, borderStyle: "dashed", borderColor: palette.rail, paddingHorizontal: 12, paddingVertical: 10 }]}>
        <Text variant="subhead" tone="muted">
          <Text variant="meta" tone="muted">
            [{quoted.kind}]
          </Text>{" "}
          {quoted.kind === "deleted" ? "This post was deleted." : "This post isn't available."}
        </Text>
      </View>
    );
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Quoted post by ${quoted.author.displayName}: ${quoted.body}`}
      onPress={() => router.push(`/post/${quoted.id}`)}
      style={({ pressed }) => [block, { marginTop: 10, paddingHorizontal: 12, paddingVertical: 10, gap: 4, backgroundColor: pressed ? palette.wash : "transparent" }]}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        <Avatar person={quoted.author} size={20} />
        <Text variant="name" numberOfLines={1} style={{ flexShrink: 1 }}>
          {quoted.author.displayName}
        </Text>
        <Text variant="meta" tone="muted" numberOfLines={1} style={{ flexShrink: 2 }}>
          @{quoted.author.username} · {relativeTime(quoted.createdAt, now, timeZone)}
        </Text>
      </View>
      {quoted.body ? (
        <Text variant="callout" numberOfLines={6} style={{ writingDirection: "auto" }}>
          {quoted.body}
        </Text>
      ) : null}
      {quoted.image ? <Image source={quoted.image.url} style={{ height: 160, borderRadius: 8, marginTop: 4, backgroundColor: palette.wash }} contentFit="cover" accessibilityLabel={quoted.image.alt || "Photo"} /> : null}
    </Pressable>
  );
}

function Summary({ icon, title, lines, onPress, label }: { icon: ReactNode; title: string; lines: string[]; onPress: () => void; label: string }) {
  const palette = usePalette();
  const block = useBlock();
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [block, { marginTop: 10, padding: 12, flexDirection: "row", gap: 12, backgroundColor: pressed ? palette.wash : "transparent" }]}
    >
      <View style={{ width: 40, height: 40, borderRadius: 8, backgroundColor: palette.primarySoft, alignItems: "center", justifyContent: "center" }}>{icon}</View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="callout" style={{ fontFamily: font.semibold }}>
          {title}
        </Text>
        {lines.map((line) => (
          <Text key={line} variant="subhead" tone="muted">
            {line}
          </Text>
        ))}
      </View>
    </Pressable>
  );
}

// Events and opportunities have their own pages on the website for now.
export function EventAttachment({ event }: { event: EventSummary }) {
  const palette = usePalette();
  const when = event.cancelled ? "Cancelled" : eventDate(event.startsAt, event.timezone);
  const where = `${event.format === "online" ? "Online" : [event.venue, event.city].filter(Boolean).join(", ")}${event.going > 0 ? ` · ${event.going} going` : ""}`;
  return (
    <Summary
      icon={<CalendarDays size={20} color={palette.primary} />}
      title={event.title}
      lines={[when, where].filter(Boolean)}
      label={`Event: ${event.title}, ${when}, ${where}. Opens on the website.`}
      onPress={() => openLink(siteLink(`/events/${event.id}`))}
    />
  );
}

export function OpportunityAttachment({ opportunity }: { opportunity: OpportunitySummary }) {
  const palette = usePalette();
  const kind = [OPPORTUNITY_TYPES[opportunity.type].label, opportunity.organisation, opportunity.remote ? "Remote" : opportunity.city].filter(Boolean).join(" · ");
  const status = opportunity.closed
    ? "Closed"
    : opportunity.deadlineAt
      ? `Apply by ${new Date(opportunity.deadlineAt).toLocaleDateString("en-AU", { day: "numeric", month: "short", timeZone })}`
      : "Open";
  return (
    <Summary
      icon={<Briefcase size={20} color={palette.primary} />}
      title={opportunity.title}
      lines={[kind, status]}
      label={`Opportunity: ${opportunity.title}, ${kind}, ${status}. Opens on the website.`}
      onPress={() => openLink(siteLink(`/opportunities/${opportunity.id}`))}
    />
  );
}

// Polls read here; voting is on the website until the app can vote.
export function PollView({ post, poll }: { post: Post; poll: Poll }) {
  const palette = usePalette();
  const closed = poll.closesAt !== null && new Date(poll.closesAt) < new Date();
  const open = !closed && poll.myVote === null && poll.closesAt !== null;
  const footer = [count(poll.votes, "vote"), pollTimeLeft(poll.closesAt), open ? "Vote on the website" : !poll.showResults ? "results show when it closes" : null].filter(Boolean).join(" · ");
  const options = (
    <View style={{ marginTop: 10, gap: 8 }}>
      {poll.options.map((option) => {
        const share = poll.showResults && poll.votes > 0 ? Math.round(((option.votes ?? 0) / poll.votes) * 100) : 0;
        const mine = poll.myVote === option.id;
        return (
          <View
            key={option.id}
            accessible
            accessibilityLabel={`${option.label}${poll.showResults ? `, ${share}%` : ""}${mine ? ", your vote" : ""}`}
            style={{ minHeight: 40, borderRadius: 8, backgroundColor: palette.wash, overflow: "hidden", flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 12, paddingVertical: 8 }}
          >
            <View style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${share}%`, backgroundColor: palette.primarySoft }} />
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexShrink: 1 }}>
              <Text variant="callout" style={{ fontFamily: font.medium, flexShrink: 1 }}>
                {option.label}
              </Text>
              {mine ? <Check size={16} color={palette.primary} /> : null}
            </View>
            {poll.showResults ? <Text variant="meta">{share}%</Text> : null}
          </View>
        );
      })}
      <Text variant="caption" tone="muted">
        {footer}
      </Text>
    </View>
  );
  if (!open) return options;
  return (
    <Pressable accessibilityRole="link" accessibilityHint="Opens the poll on the website to vote" onPress={() => openLink(postLink(post))}>
      {options}
    </Pressable>
  );
}
