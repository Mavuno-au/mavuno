export type Embed = {
  provider: "YouTube" | "Vimeo" | "Spotify" | "SoundCloud" | "TikTok" | "Loom";
  src: string;
  shape: "video" | "portrait" | "audio";
};

type Matcher = (url: URL) => Embed | null;

const YOUTUBE_ID = /^[\w-]{11}$/;

// YouTube's own ways of writing a start time: "90", "90s", "1m30s", "1h2m3s".
function seconds(time: string | null) {
  const match = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s?)?$/.exec(time ?? "");
  if (!match) return 0;
  return Number(match[1] ?? 0) * 3600 + Number(match[2] ?? 0) * 60 + Number(match[3] ?? 0);
}

// Pages under soundcloud.com/<name>/ that aren't a track or set.
const SOUNDCLOUD_PAGES = new Set(["charts", "discover", "jobs", "mobile", "pages", "pro", "search", "settings", "stations", "stream", "terms-of-use", "upload", "you"]);
const SOUNDCLOUD_TABS = new Set(["albums", "followers", "following", "likes", "popular-tracks", "reposts", "sets", "tracks"]);

const matchers: Matcher[] = [
  (url) => {
    const host = url.hostname.replace(/^(www|m|music)\./, "");
    let id: string | null = null;
    if (host === "youtu.be") id = url.pathname.slice(1);
    if (host === "youtube.com") {
      id = url.searchParams.get("v") ?? url.pathname.match(/^\/(?:shorts|live|embed)\/([\w-]+)/)?.[1] ?? null;
    }
    if (!id || !YOUTUBE_ID.test(id)) return null;
    // The player loads on a tap, so it starts playing rather than asking for a second one.
    const start = seconds(url.searchParams.get("t") ?? url.searchParams.get("start"));
    return {
      provider: "YouTube",
      src: `https://www.youtube-nocookie.com/embed/${id}?autoplay=1${start > 0 ? `&start=${start}` : ""}`,
      shape: url.pathname.startsWith("/shorts") ? "portrait" : "video",
    };
  },
  (url) => {
    const host = url.hostname.replace(/^www\./, "");
    const match =
      host === "vimeo.com"
        ? /^(?:\/channels\/[\w-]+|\/groups\/[\w-]+\/videos)?\/(\d+)(?:\/([0-9a-f]+))?\/?$/.exec(url.pathname)
        : host === "player.vimeo.com"
          ? /^\/video\/(\d+)\/?$/.exec(url.pathname)
          : null;
    if (!match) return null;
    // An unlisted video plays only with the hash its link carries.
    const hash = match[2] ?? url.searchParams.get("h") ?? "";
    return { provider: "Vimeo", src: `https://player.vimeo.com/video/${match[1]}?dnt=1&autoplay=1${/^[0-9a-f]+$/.test(hash) ? `&h=${hash}` : ""}`, shape: "video" };
  },
  (url) => {
    if (url.hostname !== "open.spotify.com") return null;
    const match = url.pathname.match(/^\/(?:intl-[a-z-]+\/)?(track|album|playlist|episode|show|artist)\/([A-Za-z0-9]+)/);
    return match ? { provider: "Spotify", src: `https://open.spotify.com/embed/${match[1]}/${match[2]}`, shape: "audio" } : null;
  },
  (url) => {
    if (url.hostname.replace(/^(www|m)\./, "") !== "soundcloud.com") return null;
    const match = /^\/([\w-]+)\/(?:(sets)\/)?([\w-]+)\/?$/.exec(url.pathname);
    if (!match?.[1] || !match[3] || SOUNDCLOUD_PAGES.has(match[1]) || (!match[2] && SOUNDCLOUD_TABS.has(match[3]))) return null;
    const track = encodeURIComponent(`https://soundcloud.com${url.pathname.replace(/\/$/, "")}`);
    return { provider: "SoundCloud", src: `https://w.soundcloud.com/player/?url=${track}&visual=false&auto_play=true`, shape: "audio" };
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
