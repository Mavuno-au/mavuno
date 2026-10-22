import { router } from "expo-router";
import { displayUrl, tokenize } from "@/lib/text";
import { openLink } from "@/util/links";
import { Text, type TypeStyle } from "@/ui/text";

// A post body or bio with its links, mentions and topics, tokenized exactly as
// the website does. Nested texts stay inside one paragraph, so the reader's
// text size and line wrapping apply to the whole of it. `selectable` is for
// text that isn't inside something pressable, such as the post a page is about.
export function RichText({ body, variant = "body", numberOfLines, selectable }: { body: string; variant?: TypeStyle; numberOfLines?: number; selectable?: boolean }) {
  return (
    // Direction follows the first strong character, so Arabic and Tigrinya run right to left.
    <Text variant={variant} numberOfLines={numberOfLines} selectable={selectable} style={{ writingDirection: "auto", textAlign: "auto" }}>
      {tokenize(body).map((segment, index) => {
        switch (segment.kind) {
          case "text":
            return segment.text;
          case "mention":
            return (
              <Text key={index} variant={variant} tone="primary" accessibilityRole="link" onPress={() => router.push(`/profile/${segment.username}`)}>
                {segment.text}
              </Text>
            );
          case "topic":
            return (
              <Text key={index} variant={variant} tone="primary" accessibilityRole="link" onPress={() => router.push(`/topic/${segment.topic}`)}>
                {segment.text}
              </Text>
            );
          case "url":
            return (
              <Text key={index} variant={variant} tone="primary" accessibilityRole="link" accessibilityHint={`Opens ${segment.href}`} onPress={() => openLink(segment.href)}>
                {displayUrl(segment.href)}
              </Text>
            );
          default: {
            const exhaustive: never = segment;
            return exhaustive;
          }
        }
      })}
    </Text>
  );
}
