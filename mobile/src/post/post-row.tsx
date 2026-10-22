import { router } from "expo-router";
import { BadgeCheck, ListTree, Share } from "lucide-react-native";
import { useState, type ReactNode } from "react";
import { Pressable, View } from "react-native";
import type { Post, PostRow as Row, ThreadPlace, Tombstone } from "@/lib/domain";
import { compact, count, fullDate, relativeTime } from "@/lib/format";
import { foldBody } from "@/lib/text";
import { siteLink } from "@/data/env";
import { useViewer } from "@/data/session";
import { usePostShadow } from "@/data/shadow";
import { EventAttachment, ImageGrid, LinkCard, OpportunityAttachment, PollView, QuotedBlock } from "@/post/attachments";
import { LikeButton } from "@/post/like-button";
import { RichText } from "@/post/rich-text";
import { Avatar, ColourDot } from "@/ui/avatar";
import { Chip } from "@/ui/controls";
import { font, Text } from "@/ui/text";
import { useLargeText, usePalette } from "@/ui/theme";
import { openLink, postLink, shareLink } from "@/util/links";
import { timeZone, useNow } from "@/util/time";

// Where a row is shown. A feed row shows the newest replies under it; a reply
// row sits in a post's conversation; an ancestor is read above the focused post.
export type Variant = "feed" | "reply" | "ancestor";

const openPost = (post: { id: string }) => router.push(`/post/${post.id}`);
const openProfile = (username: string) => router.push(`/profile/${username}`);

export function PostRow({ row, variant = "feed", previews = [], place }: { row: Row; variant?: Variant; previews?: Row[]; place?: ThreadPlace }) {
  if (row.kind === "tombstone") return <TombstoneRow row={row} />;
  return <LivePost post={row} variant={variant} previews={previews} place={place} />;
}

// A deleted post keeps its place so the replies under it still read in order.
export function TombstoneRow({ row }: { row: Tombstone }) {
  const palette = usePalette();
  return (
    <View
      accessible
      accessibilityLabel={`Deleted post. This post was deleted.${row.replies > 0 ? ` ${count(row.replies, "reply", "replies")}.` : ""}`}
      style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: palette.hairline }}
    >
      <View style={{ width: 40, height: 40, borderRadius: 20, borderWidth: 1.5, borderStyle: "dashed", borderColor: palette.rail }} />
      <Text variant="callout" tone="muted" style={{ flex: 1 }}>
        <Text variant="meta" tone="muted">
          [deleted]
        </Text>{" "}
        This post was deleted.
      </Text>
    </View>
  );
}

// The avatar opens the profile; everything else on the row opens the post.
// The row itself isn't one accessibility element, so VoiceOver reaches the
// avatar, the links in the text and the buttons one by one.
function ProfileAvatar({ post, size }: { post: Post; size: number }) {
  return (
    <Pressable accessibilityRole="link" accessibilityLabel={post.author.displayName} accessibilityHint="Opens this profile" onPress={() => openProfile(post.author.username)} hitSlop={6}>
      <Avatar person={post.author} size={size} />
    </Pressable>
  );
}

function LivePost({ post: read, variant, previews, place }: { post: Post; variant: Variant; previews: Row[]; place?: ThreadPlace }) {
  const palette = usePalette();
  const large = useLargeText();
  const post = usePostShadow(read);

  return (
    <View style={{ borderBottomWidth: variant === "ancestor" ? 0 : 1, borderBottomColor: palette.hairline }}>
      <Pressable
        accessible={false}
        onPress={() => openPost(post)}
        style={({ pressed }) => ({ paddingHorizontal: 16, paddingTop: 14, paddingBottom: variant === "ancestor" ? 6 : 2, backgroundColor: pressed ? palette.wash : "transparent" })}
      >
        <View style={{ flexDirection: large ? "column" : "row", gap: large ? 10 : 12 }}>
          <View style={{ alignItems: large ? "flex-start" : "center" }}>
            <ProfileAvatar post={post} size={large ? 52 : 40} />
            {/* In a thread a line runs down to the post this one leads to. */}
            {variant === "ancestor" && !large ? <View style={{ flex: 1, width: 2, marginTop: 4, marginBottom: -6, borderRadius: 1, backgroundColor: palette.rail }} /> : null}
          </View>
          <View style={{ flex: large ? undefined : 1, minWidth: 0, gap: 6 }}>
            <Byline post={post} place={place} stacked={large} />
            <Notes post={post} showSpace={variant === "feed"} showParent={variant === "feed"} />
            <Body post={post} />
            <Attachments post={post} />
            {post.continuation > 0 && !post.authorMuted && !place && variant !== "ancestor" ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Show thread by @${post.author.username}`}
                onPress={() => openPost(post)}
                hitSlop={8}
                style={{ flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", minHeight: 32 }}
              >
                <ListTree size={16} color={palette.primary} />
                <Text variant="subhead" tone="primary" style={{ fontFamily: font.medium }}>
                  Show thread
                </Text>
              </Pressable>
            ) : null}
            {variant === "ancestor" ? null : <Footer post={post} />}
          </View>
        </View>
      </Pressable>
      {variant === "feed" && previews.length > 0 ? <Previews post={post} previews={previews} /> : null}
    </View>
  );
}

function StatusChips({ post, place }: { post: Post; place?: ThreadPlace }) {
  if (!place && post.status === "published") return null;
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
      {place ? <ThreadBadge place={place} /> : null}
      {post.status === "pending" ? <Chip tone="warning">{post.moderationNote ?? "Waiting for review"}</Chip> : null}
      {post.status === "rejected" ? <Chip tone="danger">Not approved</Chip> : null}
    </View>
  );
}

function Verified({ size = 16 }: { size?: number }) {
  const palette = usePalette();
  return (
    <View accessible accessibilityLabel="Verified organisation">
      <BadgeCheck size={size} color={palette.primary} />
    </View>
  );
}

// One line at standard text sizes: the name keeps most of it, the handle
// gives way first, the time never does. At large sizes each takes a line.
function Byline({ post, place, stacked }: { post: Post; place?: ThreadPlace; stacked: boolean }) {
  const now = useNow();
  const when = relativeTime(post.createdAt, now, timeZone);
  const handle = (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 5, flexShrink: 10, minWidth: 0 }}>
      <ColourDot colour={post.author.colour} />
      <Text variant="meta" tone="muted" numberOfLines={1} style={{ flexShrink: 1 }}>
        @{post.author.username}
      </Text>
    </View>
  );

  if (stacked) {
    return (
      <View style={{ gap: 2 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <Text variant="name">{post.author.displayName}</Text>
          {post.author.verified ? <Verified /> : null}
        </View>
        {handle}
        <Text variant="meta" tone="muted">
          {when}
        </Text>
        <StatusChips post={post} place={place} />
      </View>
    );
  }
  return (
    <View style={{ gap: 4 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        <Text variant="name" numberOfLines={1} style={{ flexShrink: 0, maxWidth: "70%" }}>
          {post.author.displayName}
        </Text>
        {post.author.verified ? <Verified /> : null}
        {handle}
        <Text variant="meta" tone="muted" numberOfLines={1} style={{ flexShrink: 0 }}>
          · {when}
        </Text>
      </View>
      <StatusChips post={post} place={place} />
    </View>
  );
}

function ThreadBadge({ place: { position, size, capped } }: { place: ThreadPlace }) {
  const palette = usePalette();
  return (
    <View
      accessible
      accessibilityLabel={`Post ${position} of ${size}${capped ? " or more" : ""} in this thread`}
      style={{ alignSelf: "flex-start", borderRadius: 10, paddingHorizontal: 8, paddingVertical: 1, backgroundColor: palette.wash }}
    >
      <Text variant="caption" tone="muted">
        {position}/{size}
        {capped ? "+" : ""}
      </Text>
    </View>
  );
}

function Notes({ post, showSpace, showParent }: { post: Post; showSpace: boolean; showParent: boolean }) {
  const { space, parentId, parentUsername } = post;
  return (
    <>
      {space && showSpace ? (
        <Text variant="caption" tone="muted" accessibilityRole="link" onPress={() => openLink(siteLink(`/spaces/${space.slug}`))}>
          {space.emoji ? `${space.emoji} ` : ""}
          {space.name}
        </Text>
      ) : null}
      {parentId && showParent ? (
        <Text variant="caption" tone="muted">
          ↳ replying to{" "}
          {parentUsername ? (
            <Text variant="caption" tone="primary" accessibilityRole="link" onPress={() => openProfile(parentUsername)}>
              @{parentUsername}
            </Text>
          ) : (
            "[deleted]"
          )}
        </Text>
      ) : null}
    </>
  );
}

// Long posts fold after 280 characters or 8 lines, as on the website.
function Body({ post, focus = false }: { post: Post; focus?: boolean }) {
  const [expanded, setExpanded] = useState(focus);
  if (!post.body) return null;
  const folded = expanded ? null : foldBody(post.body);
  return (
    <View style={{ gap: 4 }}>
      <RichText body={folded?.folded ? folded.preview : post.body} variant={focus ? "focus" : "body"} />
      {folded?.folded ? (
        <Pressable accessibilityRole="button" onPress={() => setExpanded(true)} hitSlop={8} style={{ alignSelf: "flex-start", minHeight: 32, justifyContent: "center" }}>
          <Text variant="subhead" tone="primary" style={{ fontFamily: font.medium }}>
            Show more
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function Attachments({ post }: { post: Post }) {
  return (
    <>
      {post.images.length > 0 ? <ImageGrid images={post.images} /> : null}
      {post.poll ? <PollView post={post} poll={post.poll} /> : null}
      {post.linkUrl && !post.quoted ? <LinkCard url={post.linkUrl} preview={post.linkPreview} /> : null}
      {post.quoted ? <QuotedBlock quoted={post.quoted} /> : null}
      {post.event ? <EventAttachment event={post.event} /> : null}
      {post.opportunity ? <OpportunityAttachment opportunity={post.opportunity} /> : null}
    </>
  );
}

// The counts, a like for someone else's post (your own shows its count in
// the text), and the share sheet in place of Copy link. Replying and quoting
// come next.
function Footer({ post, focus = false }: { post: Post; focus?: boolean }) {
  const palette = usePalette();
  const own = useViewer()?.id === post.authorId;
  const counts = [
    post.replies > 0 ? count(post.replies, "reply", "replies") : null,
    post.quotes > 0 ? count(post.quotes, "quote") : null,
    own && post.likes > 0 ? count(post.likes, "like") : null,
  ].filter(Boolean);
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 2, minHeight: focus ? 48 : 44, borderTopWidth: focus ? 1 : 0, borderTopColor: palette.hairline }}>
      <Text variant="meta" tone="muted" style={{ flex: 1 }}>
        {counts.join(" · ")}
      </Text>
      {own ? null : <LikeButton post={post} size={focus ? 20 : 18} />}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Share"
        onPress={() => shareLink(postLink(post))}
        hitSlop={6}
        style={({ pressed }) => ({ width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", marginRight: -12, backgroundColor: pressed ? palette.wash : "transparent" })}
      >
        <Share size={focus ? 20 : 18} color={palette.inkMuted} strokeWidth={1.9} />
      </Pressable>
    </View>
  );
}

// The newest replies under a post in a feed, smaller, with a way to the rest.
function Previews({ post, previews }: { post: Post; previews: Row[] }) {
  const palette = usePalette();
  const large = useLargeText();
  const now = useNow();
  const shown = previews.filter((row): row is Post => row.kind === "post");
  return (
    <View style={{ paddingLeft: large ? 16 : 68, paddingRight: 16, paddingBottom: 10 }}>
      {shown.map((reply) => (
        <Pressable
          key={reply.id}
          accessible={false}
          onPress={() => openPost(reply)}
          style={({ pressed }) => ({ flexDirection: "row", gap: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: pressed ? palette.wash : "transparent" })}
        >
          <ProfileAvatar post={reply} size={28} />
          <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Text variant="subhead" numberOfLines={1} style={{ fontFamily: font.semibold, flexShrink: 1 }}>
                {reply.author.displayName}
              </Text>
              <Text variant="caption" tone="muted" style={{ flexShrink: 0 }}>
                {relativeTime(reply.createdAt, now, timeZone)}
              </Text>
            </View>
            <RichText body={reply.body} variant="callout" numberOfLines={4} />
          </View>
        </Pressable>
      ))}
      {post.replies > shown.length ? (
        <Pressable accessibilityRole="button" onPress={() => openPost(post)} hitSlop={6} style={{ alignSelf: "flex-start", minHeight: 36, justifyContent: "center" }}>
          <Text variant="subhead" tone="primary" style={{ fontFamily: font.medium }}>
            Show all {compact(post.replies)}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

// The post a page is about: larger text, its full date, and its counts.
export function FocusedPost({ post: read, place, onLayout }: { post: Post; place?: ThreadPlace; onLayout?: () => void }): ReactNode {
  const palette = usePalette();
  const large = useLargeText();
  const post = usePostShadow(read);
  return (
    <View onLayout={onLayout} style={{ paddingHorizontal: 16, paddingTop: 12, gap: 12, borderBottomWidth: 1, borderBottomColor: palette.hairline }}>
      <View style={{ flexDirection: large ? "column" : "row", alignItems: large ? "flex-start" : "center", gap: 12 }}>
        <ProfileAvatar post={post} size={large ? 52 : 44} />
        <View style={{ flex: large ? undefined : 1, gap: 2 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <Text variant="headline" accessibilityRole="link" onPress={() => openProfile(post.author.username)}>
              {post.author.displayName}
            </Text>
            {post.author.verified ? <Verified size={18} /> : null}
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
            <ColourDot colour={post.author.colour} />
            <Text variant="meta" tone="muted" style={{ fontSize: 14 }}>
              @{post.author.username}
            </Text>
          </View>
        </View>
      </View>
      <StatusChips post={post} place={place} />
      <Notes post={post} showSpace showParent={false} />
      <Body post={post} focus />
      <Attachments post={post} />
      <Text variant="meta" tone="muted">
        {fullDate(post.createdAt, timeZone)}
      </Text>
      <Footer post={post} focus />
    </View>
  );
}
