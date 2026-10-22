import { useState, type ReactNode } from "react";
import { Alert, Pressable } from "react-native";
import { languageName } from "@/lib/catalogue";
import type { Post } from "@/lib/domain";
import { translatePost } from "@/data/posts";
import { useViewer } from "@/data/session";
import { font, Text } from "@/ui/text";
import { openLink } from "@/util/links";

type State = { kind: "original" } | { kind: "loading" } | { kind: "translated"; text: string };

// The phone's language, as the website uses the browser's.
const phoneLanguage = () => new Intl.DateTimeFormat().resolvedOptions().locale.slice(0, 2).toLowerCase();

// The website's Translate from X (src/components/post/translation.tsx).
// `render` draws the body, so a translation folds the same way as the original.
export function Translation({ post, render }: { post: Post; render: (text: string) => ReactNode }) {
  const viewer = useViewer();
  const [state, setState] = useState<State>({ kind: "original" });
  const target = viewer?.translationLanguage ?? phoneLanguage();
  if (!target || target === post.language || post.status !== "published" || !post.body) return render(post.body);

  async function translate() {
    if (post.translation) return setState({ kind: "translated", text: post.translation });
    setState({ kind: "loading" });
    const result = await translatePost(post.id, target);
    switch (result.kind) {
      case "translated":
        return setState({ kind: "translated", text: result.text });
      case "elsewhere":
        setState({ kind: "original" });
        return openLink(`https://translate.google.com/?sl=${post.language}&tl=${target}&text=${encodeURIComponent(post.body)}`);
      case "failed":
        setState({ kind: "original" });
        return Alert.alert("Couldn't translate this post", result.message);
      default: {
        const exhaustive: never = result;
        return exhaustive;
      }
    }
  }

  const from = languageName(post.language);
  return (
    <>
      {render(state.kind === "translated" ? state.text : post.body)}
      <Pressable
        accessibilityRole="button"
        disabled={state.kind === "loading"}
        onPress={() => (state.kind === "translated" ? setState({ kind: "original" }) : void translate())}
        hitSlop={8}
        style={{ alignSelf: "flex-start", minHeight: 32, justifyContent: "center" }}
      >
        <Text variant="subhead" tone="primary" style={{ fontFamily: font.medium, opacity: state.kind === "loading" ? 0.6 : 1 }}>
          {state.kind === "translated" ? `Translated from ${from} · Show original` : state.kind === "loading" ? "Translating…" : `Translate from ${from}`}
        </Text>
      </Pressable>
    </>
  );
}
