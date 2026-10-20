export type Embed = {
  provider: "YouTube" | "Vimeo" | "Spotify" | "SoundCloud" | "TikTok" | "Loom";
  src: string;
  shape: "video" | "portrait" | "audio";
};

type Matcher = (url: URL) => Embed | null;

const YOUTUBE_ID = /^[\w-]{11}$/;

const matchers: Matcher[] = [
  (url) => {
    const host = url.hostname.replace(/^(www|m|music)\./, "");
    let id: string | null = null;
    if (host === "youtu.be") id = url.pathname.slice(1);
    if (host === "youtube.com") {
      id = url.searchParams.get("v") ?? url.pathname.match(/^\/(?:shorts|live|embed)\/([\w-]+)/)?.[1] ?? null;
    }
    if (!id || !YOUTUBE_ID.test(id)) return null;
    const start = Number.parseInt(url.searchParams.get("t") ?? "", 10);
    const query = Number.isFinite(start) && start > 0 ? `?start=${start}` : "";
    return {
      provider: "YouTube",
      src: `https://www.youtube-nocookie.com/embed/${id}${query}`,
      shape: url.pathname.startsWith("/shorts") ? "portrait" : "video",
    };
  },
  (url) => {
    const id = url.hostname.replace(/^www\./, "") === "vimeo.com" ? url.pathname.match(/^\/(\d+)/)?.[1] : null;
    return id ? { provider: "Vimeo", src: `https://player.vimeo.com/video/${id}?dnt=1`, shape: "video" } : null;
  },
  (url) => {
    if (url.hostname !== "open.spotify.com") return null;
    const match = url.pathname.match(/^\/(?:intl-[a-z-]+\/)?(track|album|playlist|episode|show|artist)\/([A-Za-z0-9]+)/);
    return match ? { provider: "Spotify", src: `https://open.spotify.com/embed/${match[1]}/${match[2]}`, shape: "audio" } : null;
  },
  (url) => {
    if (url.hostname.replace(/^(www|m)\./, "") !== "soundcloud.com" || url.pathname.split("/").filter(Boolean).length < 2) return null;
    const track = encodeURIComponent(`https://soundcloud.com${url.pathname}`);
    return { provider: "SoundCloud", src: `https://w.soundcloud.com/player/?url=${track}&visual=false`, shape: "audio" };
  },
  (url) => {
    const id = url.hostname.replace(/^(www|m)\./, "") === "tiktok.com" ? url.pathname.match(/\/video\/(\d+)/)?.[1] : null;
    return id ? { provider: "TikTok", src: `https://www.tiktok.com/embed/v2/${id}`, shape: "portrait" } : null;
  },
  (url) => {
    const id = url.hostname.replace(/^www\./, "") === "loom.com" ? url.pathname.match(/^\/share\/([a-f0-9]{32})/)?.[1] : null;
    return id ? { provider: "Loom", src: `https://www.loom.com/embed/${id}`, shape: "video" } : null;
  },
];

// The player URL is always built here from a known provider, never taken from
// the post, so only these sites can ever be framed.
export function embedFor(href: string): Embed | null {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  for (const match of matchers) {
    const embed = match(url);
    if (embed) return embed;
  }
  return null;
}
