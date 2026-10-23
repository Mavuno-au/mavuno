import { useEffect, useRef, type ComponentRef } from "react";
import { useWindowDimensions, View } from "react-native";
import { WebView, type WebViewNavigation } from "react-native-webview";
import type { Embed } from "@/lib/embeds";
import { openPlayer } from "@/util/links";

// Players frame pages from mavuno.au, as on the website: YouTube refuses an
// embed with no page around it.
const ORIGIN = "https://mavuno.au";

const attribute = (value: string) => value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

// The website's "play here": the provider's own player inside the card,
// loaded only once tapped, so reading a feed never contacts the player's site.
// The player address is built by lib/embeds from a fixed list of providers,
// never taken from the post. As on Bluesky, it stops once scrolled off screen
// (onLeave), and the card stops it when its screen loses focus, so nothing
// plays out of sight.
export function InlinePlayer({ embed, title, onLeave }: { embed: Embed; title: string; onLeave: () => void }) {
  const frame = useRef<ComponentRef<typeof View>>(null);
  const { height } = useWindowDimensions();
  useEffect(() => {
    const timer = setInterval(() => {
      frame.current?.measureInWindow((_x, y, _width, shown) => {
        if (shown > 0 && (y + shown < 0 || y > height)) onLeave();
      });
    }, 500);
    return () => clearInterval(timer);
  }, [height, onLeave]);

  const html = `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0;height:100%;background:#000}iframe{border:0;width:100%;height:100%}</style><iframe src="${attribute(embed.src)}" title="${attribute(title)}" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe>`;
  const shape = { video: { aspectRatio: 16 / 9 }, portrait: { height: 520 }, audio: { height: 152 } }[embed.shape];

  // The player loads what it needs in its frame; a link it offers (Watch on
  // YouTube, the channel) leaves the app rather than replacing the player.
  const allow = (request: WebViewNavigation & { isTopFrame?: boolean }) => {
    if (request.isTopFrame === false || request.url === "about:blank" || request.url.startsWith(ORIGIN)) return true;
    openPlayer(request.url);
    return false;
  };

  return (
    <View ref={frame} style={[shape, { backgroundColor: "#000000" }]} accessibilityLabel={`${embed.provider} player: ${title}`}>
      <WebView
        source={{ html, baseUrl: ORIGIN }}
        originWhitelist={["*"]}
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        allowsFullscreenVideo
        allowsAirPlayForMediaPlayback
        scrollEnabled={false}
        bounces={false}
        onShouldStartLoadWithRequest={allow}
        style={{ backgroundColor: "#000000" }}
      />
    </View>
  );
}
