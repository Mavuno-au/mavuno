"use client";

import { usePathname, useRouter } from "next/navigation";
import { useState, useSyncExternalStore, type ReactNode } from "react";
import { toast } from "sonner";
import { useViewer } from "@/components/shell/viewer-context";
import { languageName } from "@/lib/catalogue";
import type { Post } from "@/lib/domain";
import { joinPath } from "@/lib/safe-redirect";

const browserLanguage = () => navigator.language.slice(0, 2).toLowerCase();
const noSubscription = () => () => {};

type State = { kind: "original" } | { kind: "loading" } | { kind: "translated"; text: string };

// `render` draws the body, so a translation is folded the same way as the original.
export function Translation({ post, render }: { post: Post; render: (text: string) => ReactNode }) {
  const viewer = useViewer();
  const router = useRouter();
  const pathname = usePathname();
  const browser = useSyncExternalStore(noSubscription, browserLanguage, () => null);
  const target = viewer?.translationLanguage ?? browser;
  const [state, setState] = useState<State>({ kind: "original" });

  if (!target || target === post.language || post.status !== "published") return render(post.body);

  async function translate() {
    if (!viewer) return router.push(joinPath(pathname));
    if (post.translation) return setState({ kind: "translated", text: post.translation });
    setState({ kind: "loading" });
    const response = await fetch("/api/translate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ postId: post.id, target }),
    }).catch(() => null);
    const result: unknown = await response?.json().catch(() => null);
    if (response?.ok && typeof result === "object" && result !== null && "text" in result && typeof result.text === "string") {
      return setState({ kind: "translated", text: result.text });
    }
    setState({ kind: "original" });
    if (response?.status === 501) {
      window.open(`https://translate.google.com/?sl=${post.language}&tl=${target}&text=${encodeURIComponent(post.body)}`, "_blank", "noopener");
      return;
    }
    toast.error(response?.status === 429 ? "Too many translations. Wait a minute." : "Couldn't translate this post.");
  }

  return (
    <>
      {render(state.kind === "translated" ? state.text : post.body)}
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          if (state.kind === "translated") setState({ kind: "original" });
          else void translate();
        }}
        disabled={state.kind === "loading"}
        className="mt-1 text-sm text-primary hover:underline disabled:opacity-60"
      >
        {state.kind === "translated" ? `Translated from ${languageName(post.language)} · Show original` : state.kind === "loading" ? "Translating…" : `Translate from ${languageName(post.language)}`}
      </button>
    </>
  );
}
