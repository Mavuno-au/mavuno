import { Image } from "expo-image";
import { router } from "expo-router";
import { Briefcase, CalendarDays, Check, Maximize2, Play } from "lucide-react-native";
import { useEffect, useState, type ReactNode } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { OPPORTUNITY_TYPES } from "@/lib/catalogue";
import type { EventSummary, LinkPreview, OpportunitySummary, Poll, Post, PostImage, QuotedPost } from "@/lib/domain";
import { embedFor } from "@/lib/embeds";
import { count, eventDate, pollTimeLeft, relativeTime } from "@/lib/format";
import { displayUrl } from "@/lib/text";
import { loadLinkPreview, loadPost, votePoll } from "@/data/posts";
import { useShadowWriter } from "@/data/shadow";
import { applyBy } from "@/community/opportunity-row";
import { useActsFor } from "@/post/post-actions";
import { InlinePlayer } from "@/post/player";
import { Avatar } from "@/ui/avatar";
import { font, Text } from "@/ui/text";
import { usePalette } from "@/ui/theme";
import { toast } from "@/ui/toast";
import { haptics } from "@/util/haptics";
import { openLabelledLink, openPlayer } from "@/util/links";
import { openPhotos, sharePhoto } from "@/util/photos";
import { timeZone, useNow } from "@/util/time";

// Bordered blocks are only for things embedded in a post (DESIGN.md).
function useBlock() {
  const palette = usePalette();
  return { borderWidth: 1, borderColor: palette.hairline, borderRadius: 12, overflow: "hidden" as const };
}

const imageLabel = (images: PostImage[], index: number) => images[index]?.alt || (images.length > 1 ? `Photo ${index + 1} of ${images.length}` : "Photo");

// A single photo keeps its own shape between a wide panorama and a tall
// portrait. Feeds allow up to twice as tall as wide, the post a page is about
// four times, as on Bluesky; anything beyond is cropped and says so.
const WIDEST = 2;
const TALLEST = { feed: 1 / 2, focus: 1 / 4 };

export function ImageGrid({ images, focus = false }: { images: PostImage[]; focus?: boolean }) {
  const palette = usePalette();
  const block = useBlock();
  const share = (image: PostImage) => {
    haptics.confirm();
    void sharePhoto(image.url);
  };
  // Tapping a photo opens it full screen, with its description under ALT;
  // pressing and holding one shares it, which is also how it's saved.
  const tile = (image: PostImage, index: number, cropped = false) => (
    <Pressable
      key={image.id}
      style={{ flex: 1, backgroundColor: palette.wash }}
      accessibilityRole="imagebutton"
      accessibilityLabel={imageLabel(images, index)}
      accessibilityHint={cropped ? "Shown cropped. Opens the whole photo full screen" : "Opens the photo full screen"}
      accessibilityActions={[{ name: "share", label: "Share or save photo" }]}
      onAccessibilityAction={(event) => {
        if (event.nativeEvent.actionName === "share") share(image);
      }}
      onPress={() => openPhotos(images, index)}
      onLongPress={() => share(image)}
      delayLongPress={350}
    >
      <Image source={image.url} style={{ flex: 1 }} contentFit="cover" transition={150} accessible={false} accessibilityIgnoresInvertColors />
      {cropped ? (
        <View style={{ position: "absolute", right: 6, bottom: 6, width: 22, height: 22, borderRadius: 4, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0, 0, 0, 0.7)" }}>
          <Maximize2 size={13} color="#ffffff" strokeWidth={2.4} />
        </View>
      ) : null}
      {image.alt ? (
        <View style={{ position: "absolute", left: 6, bottom: 6, borderRadius: 4, paddingHorizontal: 4, paddingVertical: 1, backgroundColor: "rgba(0, 0, 0, 0.7)" }}>
          <Text allowFontScaling={false} style={{ fontFamily: font.monoMedium, fontSize: 10, lineHeight: 14, color: "#ffffff" }}>
            ALT
          </Text>
        </View>
      ) : null}
    </Pressable>
  );

  const [first, second, third, fourth] = images;
  if (!first) return null;
  if (images.length === 1) {
    const own = first.width && first.height ? first.width / first.height : 16 / 10;
    const tallest = focus ? TALLEST.focus : TALLEST.feed;
    const ratio = Math.min(Math.max(own, tallest), WIDEST);
    return <View style={[block, { marginTop: 10, aspectRatio: ratio }]}>{tile(first, 0, ratio !== own)}</View>;
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

// A post just written may not have its card yet: the server fetches it after
// the post is created. Its row asks a few times, as the website's awaitCard does.
const CARD_DELAYS = [1000, 2000, 3000, 5000, 8000, 13000];
const awaitedCards = new Map<string, string>();

export function awaitCard(url: string, postId: string) {
  awaitedCards.set(url, postId);
}

function useLateCard(url: string, preview: LinkPreview | null) {
  const [postId] = useState(() => (preview ? undefined : awaitedCards.get(url)));
  const [late, setLate] = useState<LinkPreview | null>(null);
  useEffect(() => {
    if (!postId) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;
    const ask = async (attempt: number) => {
      const found = await loadLinkPreview(postId).catch(() => null);
      if (stopped) return;
      const delay = CARD_DELAYS[attempt + 1];
      if (found || delay === undefined) {
        awaitedCards.delete(url);
        if (found) setLate(found);
        return;
      }
      timer = setTimeout(() => void ask(attempt + 1), delay);
    };
    timer = setTimeout(() => void ask(0), CARD_DELAYS[0]);
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
  }, [postId, url]);
  return preview ?? late;
}

// A video or song link (lib/embeds) gets a card even before its preview
// arrives, and opens in the provider's app rather than playing in the feed.
export function LinkCard({ url, preview: read }: { url: string; preview: LinkPreview | null }) {
  const palette = usePalette();
  const block = useBlock();
  const preview = useLateCard(url, read);
  const embed = embedFor(url);
  const [playing, setPlaying] = useState(false);
  if (!preview && !embed) return null;
  const source = embed ? `${embed.provider} · play here` : (preview?.siteName ?? displayUrl(url));

  // Played in the card, as on the website, with a way out to the provider's app.
  if (embed && playing) {
    return (
      <View style={[block, { marginTop: 10 }]}>
        <InlinePlayer embed={embed} title={preview?.title ?? `${embed.provider} player`} />
        <Pressable
          accessibilityRole="link"
          onPress={() => openPlayer(url)}
          style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 6, minHeight: 44, paddingHorizontal: 12, backgroundColor: pressed ? palette.wash : "transparent" })}
        >
          <Text variant="caption" tone="muted" numberOfLines={1} style={{ flex: 1 }}>
            {preview?.title ?? displayUrl(url)}
          </Text>
          <Text variant="caption" tone="primary">
            Open in {embed.provider}
          </Text>
        </Pressable>
      </View>
    );
  }

  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={[preview?.title, source].filter(Boolean).join(", ")}
      // A page can name any site for itself; the reader is told if that isn't where the link goes.
      onPress={() => (embed ? setPlaying(true) : openLabelledLink(url, preview?.siteName ?? ""))}
      style={({ pressed }) => [block, { marginTop: 10, backgroundColor: pressed ? palette.wash : "transparent" }]}
    >
      {preview?.image ? (
        <View style={{ aspectRatio: 1.91, backgroundColor: palette.wash }}>
          <Image source={preview.image} style={StyleSheet.absoluteFill} contentFit="cover" accessible={false} />
          {embed ? (
            <View style={[StyleSheet.absoluteFill, { alignItems: "center", justifyContent: "center" }]}>
              <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: "rgba(0, 0, 0, 0.7)", alignItems: "center", justifyContent: "center" }}>
                <Play size={24} color="#ffffff" fill="#ffffff" style={{ marginLeft: 2 }} />
              </View>
            </View>
          ) : null}
        </View>
      ) : null}
      <View style={{ gap: 2, paddingHorizontal: 12, paddingVertical: 10 }}>
        <Text variant="caption" tone="muted" numberOfLines={1}>
          {source}
        </Text>
        {preview?.title ? (
          <Text variant="callout" numberOfLines={2} style={{ fontFamily: font.medium }}>
            {preview.title}
          </Text>
        ) : null}
        {preview?.description ? (
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
  const [shown, setShown] = useState(false);
  if (quoted.kind === "muted") {
    if (shown) return <QuotedBlock quoted={quoted.post} />;
    return (
      <View style={[block, { marginTop: 10, borderStyle: "dashed", borderColor: palette.rail, paddingHorizontal: 12, paddingVertical: 4, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }]}>
        <Text variant="subhead" tone="muted" style={{ flexShrink: 1 }}>
          Post by someone you muted.
        </Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Show the post by someone you muted" onPress={() => setShown(true)} hitSlop={8} style={{ minHeight: 44, justifyContent: "center" }}>
          <Text variant="subhead" tone="primary" style={{ fontFamily: font.medium }}>
            Show
          </Text>
        </Pressable>
      </View>
    );
  }
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

export function EventAttachment({ event }: { event: EventSummary }) {
  const palette = usePalette();
  const when = event.cancelled ? "Cancelled" : eventDate(event.startsAt, event.timezone);
  const where = `${event.format === "online" ? "Online" : [event.venue, event.city].filter(Boolean).join(", ")}${event.going > 0 ? ` · ${event.going} going` : ""}`;
  return (
    <Summary
      icon={<CalendarDays size={20} color={palette.primary} />}
      title={event.title}
      lines={[when, where].filter(Boolean)}
      label={`Event: ${event.title}, ${when}, ${where}`}
      onPress={() => router.push(`/event/${event.id}`)}
    />
  );
}

export function OpportunityAttachment({ opportunity }: { opportunity: OpportunitySummary }) {
  const palette = usePalette();
  const kind = [OPPORTUNITY_TYPES[opportunity.type].label, opportunity.organisation, opportunity.remote ? "Remote" : opportunity.city].filter(Boolean).join(" · ");
  const status = opportunity.closed ? "Closed" : opportunity.deadlineAt ? applyBy(opportunity.deadlineAt) : "Open";
  return (
    <Summary
      icon={<Briefcase size={20} color={palette.primary} />}
      title={opportunity.title}
      lines={[kind, status]}
      label={`Opportunity: ${opportunity.title}, ${kind}, ${status}`}
      onPress={() => router.push(`/opportunity/${opportunity.id}`)}
    />
  );
}

// Tap an option to vote; the results show once you have, or when the poll
// closes. Authors can't vote in their own polls.
export function PollView({ post, poll }: { post: Post; poll: Poll }) {
  const palette = usePalette();
  const { setPoll } = useShadowWriter();
  const [voting, setVoting] = useState<string | null>(null);
  const closed = poll.closesAt !== null && new Date(poll.closesAt) < new Date();
  const own = useActsFor(post.authorId);
  const open = !closed && poll.myVote === null && poll.closesAt !== null && !own;
  const footer = [count(poll.votes, "vote"), pollTimeLeft(poll.closesAt), !poll.showResults && !open ? "results show when it closes" : null].filter(Boolean).join(" · ");

  async function vote(optionId: string) {
    setVoting(optionId);
    const result = await votePoll(post.id, optionId);
    if (!result.ok) {
      setVoting(null);
      return toast(`Couldn't vote. ${result.error}`, { tone: "error" });
    }
    const fresh = await loadPost(post.id).catch(() => null);
    setVoting(null);
    if (fresh?.kind === "post" && fresh.poll) return setPoll(post.id, fresh.poll);
    // The vote counted even if the poll couldn't be read again, so it closes
    // to further taps, which the database would refuse.
    setPoll(post.id, {
      ...poll,
      myVote: optionId,
      votes: poll.votes + 1,
      options: poll.options.map((option) => (option.id === optionId && option.votes !== null ? { ...option, votes: option.votes + 1 } : option)),
    });
  }

  return (
    <View style={{ marginTop: 10, gap: 8 }}>
      {poll.options.map((option) => {
        const share = poll.showResults && poll.votes > 0 ? Math.round(((option.votes ?? 0) / poll.votes) * 100) : 0;
        const mine = poll.myVote === option.id;
        const content = (
          <>
            {/* The bar fills a layer the size of the whole option, so 100% reaches the edge. */}
            <View pointerEvents="none" style={StyleSheet.absoluteFill}>
              <View style={{ width: `${share}%`, height: "100%", backgroundColor: palette.primarySoft }} />
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexShrink: 1 }}>
              <Text variant="callout" style={{ fontFamily: font.medium, flexShrink: 1 }}>
                {option.label}
              </Text>
              {mine ? <Check size={16} color={palette.primary} /> : null}
            </View>
            {poll.showResults ? <Text variant="meta">{share}%</Text> : null}
          </>
        );
        const style = {
          minHeight: 44,
          borderRadius: 10,
          overflow: "hidden" as const,
          flexDirection: "row" as const,
          alignItems: "center" as const,
          justifyContent: "space-between" as const,
          paddingHorizontal: 12,
          paddingVertical: 8,
        };
        if (!open) {
          return (
            <View key={option.id} accessible accessibilityLabel={`${option.label}${poll.showResults ? `, ${share}%` : ""}${mine ? ", your vote" : ""}`} style={[style, { backgroundColor: palette.wash }]}>
              {content}
            </View>
          );
        }
        return (
          <Pressable
            key={option.id}
            accessibilityRole="button"
            accessibilityLabel={`Vote for ${option.label}`}
            disabled={voting !== null}
            onPress={() => void vote(option.id)}
            style={({ pressed }) => [style, { borderWidth: 1, borderColor: palette.primary, backgroundColor: pressed || voting === option.id ? palette.primarySoft : palette.surface }]}
          >
            {content}
          </Pressable>
        );
      })}
      <Text variant="caption" tone="muted">
        {footer}
      </Text>
    </View>
  );
}
