import { Image } from "expo-image";
import { Reply } from "lucide-react-native";
import { Pressable, View } from "react-native";
import type { Message, ReplyQuote } from "@/lib/messages";
import { LinkCard } from "@/post/attachments";
import { RichText } from "@/post/rich-text";
import { Avatar } from "@/ui/avatar";
import { font, Text } from "@/ui/text";
import { usePalette } from "@/ui/theme";
import { openPhotos } from "@/util/photos";

export type Delivery = { kind: "sent" } | { kind: "sending" } | { kind: "failed"; error: string };

// One message in a conversation. Messages from the same person a few minutes
// apart form a run: the name shows on the first, the avatar on the last.
// What pressing and holding offers is also the bubble's VoiceOver actions,
// and a message that didn't send is a button that sends it again.
export function MessageBubble({
  message,
  mine,
  group,
  first,
  last,
  viewerId,
  authorName,
  delivery = { kind: "sent" },
  actions = [],
  highlighted = false,
  onJump,
  onLongPress,
  onRetry,
  onReact,
}: {
  message: Message;
  mine: boolean;
  group: boolean;
  first: boolean;
  last: boolean;
  viewerId: string;
  authorName: (senderId: string | null) => string;
  delivery?: Delivery;
  actions?: { label: string; onPress: () => void }[];
  // Just jumped to from a quote of it.
  highlighted?: boolean;
  onJump?: (messageId: string) => void;
  onLongPress: () => void;
  onRetry: () => void;
  onReact: (emoji: string, on: boolean) => void;
}) {
  const palette = usePalette();
  const { content } = message;
  const reactions = summarise(message.reactions, viewerId);
  const showAvatar = group && !mine;
  const bubbleColour = mine ? palette.primary : palette.wash;
  const textTone = mine ? "primaryInk" : "ink";

  return (
    <View style={{ paddingHorizontal: 12, paddingTop: first ? 10 : 2, alignItems: mine ? "flex-end" : "flex-start", backgroundColor: highlighted ? palette.primarySoft : undefined }}>
      {group && !mine && first ? (
        <Text variant="caption" tone="muted" style={{ marginLeft: showAvatar ? 40 : 4, marginBottom: 2 }}>
          {message.sender?.displayName ?? "Former member"}
        </Text>
      ) : null}
      <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 8, maxWidth: "86%" }}>
        {showAvatar ? <View style={{ width: 32 }}>{last && message.sender ? <Avatar person={message.sender} size={32} /> : null}</View> : null}
        <Pressable
          accessibilityRole={delivery.kind === "failed" ? "button" : "text"}
          accessibilityHint={delivery.kind === "failed" ? "Couldn't send. Sends it again" : undefined}
          accessibilityActions={actions.map((action) => ({ name: action.label, label: action.label }))}
          onAccessibilityAction={(event) => actions.find((action) => action.label === event.nativeEvent.actionName)?.onPress()}
          onLongPress={onLongPress}
          onPress={delivery.kind === "failed" ? onRetry : undefined}
          delayLongPress={300}
          style={{ flexShrink: 1, opacity: delivery.kind === "sent" ? 1 : 0.6 }}
        >
          <View style={{ borderRadius: 18, borderBottomRightRadius: mine && last ? 6 : 18, borderBottomLeftRadius: !mine && last ? 6 : 18, backgroundColor: bubbleColour, overflow: "hidden" }}>
            {message.replyTo ? <Quote quote={message.replyTo} mine={mine} authorName={authorName} onPress={onJump} /> : null}
            {content.kind === "removed" ? (
              <Text variant="callout" tone="muted" style={{ paddingHorizontal: 14, paddingVertical: 9, fontStyle: "italic" }}>
                Message removed by a moderator
              </Text>
            ) : (
              <>
                {content.images.length > 0 ? (
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 2 }}>
                    {content.images.map((image, index) => (
                      <Pressable
                        key={image.path}
                        accessibilityRole="imagebutton"
                        accessibilityLabel={image.alt || "Photo"}
                        onPress={() => openPhotos(content.images, index)}
                        style={{ width: content.images.length === 1 ? 240 : 119, height: content.images.length === 1 ? 240 : 119 }}
                      >
                        <Image source={image.url} style={{ flex: 1, backgroundColor: palette.hairline }} contentFit="cover" />
                      </Pressable>
                    ))}
                  </View>
                ) : null}
                {content.body ? (
                  <View style={{ paddingHorizontal: 14, paddingVertical: 9 }}>
                    {mine ? (
                      <Text variant="callout" tone={textTone} style={{ writingDirection: "auto" }}>
                        {content.body}
                      </Text>
                    ) : (
                      <RichText body={content.body} variant="callout" />
                    )}
                  </View>
                ) : null}
              </>
            )}
          </View>
          {content.kind === "message" && content.linkUrl ? (
            <View style={{ width: 260 }}>
              <LinkCard url={content.linkUrl} preview={content.linkPreview} />
            </View>
          ) : null}
        </Pressable>
      </View>
      {reactions.length > 0 ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 4, marginTop: 4, marginLeft: showAvatar ? 40 : 0 }}>
          {reactions.map((reaction) => (
            <Pressable
              key={reaction.emoji}
              accessibilityRole="button"
              accessibilityLabel={`${reaction.emoji} ${reaction.count}${reaction.mine ? ", including you" : ""}`}
              accessibilityState={{ selected: reaction.mine }}
              onPress={() => onReact(reaction.emoji, !reaction.mine)}
              hitSlop={{ top: 8, bottom: 8 }}
              style={{ flexDirection: "row", alignItems: "center", gap: 3, minHeight: 28, paddingHorizontal: 8, borderRadius: 14, borderWidth: 1, borderColor: reaction.mine ? palette.primary : palette.hairline, backgroundColor: reaction.mine ? palette.primarySoft : palette.surface }}
            >
              <Text allowFontScaling={false} style={{ fontSize: 14 }}>
                {reaction.emoji}
              </Text>
              <Text variant="caption" tone={reaction.mine ? "primary" : "muted"}>
                {reaction.count}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}
      {delivery.kind === "failed" ? (
        <Pressable accessibilityRole="button" onPress={onRetry} style={{ minHeight: 44, justifyContent: "center" }}>
          <Text variant="small" tone="destructive">
            Couldn't send. Tap to try again.
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function Quote({ quote, mine, authorName, onPress }: { quote: ReplyQuote; mine: boolean; authorName: (senderId: string | null) => string; onPress?: (messageId: string) => void }) {
  const palette = usePalette();
  const text = quote.content.kind === "removed" ? "Message removed" : quote.content.body || (quote.content.images > 0 ? "Photo" : "");
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Replying to ${authorName(quote.senderId)}: ${text}`}
      accessibilityHint="Shows that message"
      onPress={onPress ? () => onPress(quote.id) : undefined}
      style={{ flexDirection: "row", gap: 6, marginHorizontal: 8, marginTop: 8, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12, backgroundColor: mine ? "rgba(255, 255, 255, 0.16)" : palette.surface }}
    >
      <Reply size={14} color={mine ? palette.primaryInk : palette.inkMuted} />
      <View style={{ flexShrink: 1 }}>
        <Text variant="caption" tone={mine ? "primaryInk" : "muted"} style={{ fontFamily: font.semibold }}>
          {authorName(quote.senderId)}
        </Text>
        <Text variant="small" tone={mine ? "primaryInk" : "muted"} numberOfLines={2}>
          {text}
        </Text>
      </View>
    </Pressable>
  );
}

function summarise(reactions: Message["reactions"], viewerId: string) {
  const byEmoji = new Map<string, { emoji: string; count: number; mine: boolean }>();
  for (const reaction of reactions) {
    const entry = byEmoji.get(reaction.emoji) ?? { emoji: reaction.emoji, count: 0, mine: false };
    entry.count += 1;
    entry.mine ||= reaction.userId === viewerId;
    byEmoji.set(reaction.emoji, entry);
  }
  return [...byEmoji.values()];
}
