import "server-only";
import { lookup } from "node:dns";
import { isIP } from "node:net";
import { Agent, fetch } from "undici";
import { z } from "zod";
import { isPublicAddress } from "@/lib/network";
import type { LinkPreview } from "@/lib/domain";
import { embedFor, type Embed } from "@/lib/embeds";

const MAX_BYTES = 512 * 1024;
const MAX_REDIRECTS = 3;

// Every connection resolves the host itself and refuses private addresses, so
// a DNS answer cannot change between the check and the request. Hosts that are
// already IP addresses never reach the lookup and are checked per hop instead.
const agent = new Agent({
  connect: {
    timeout: 4000,
    lookup(hostname, options, callback) {
      lookup(hostname, { ...options, all: true }, (error, addresses) => {
        if (error) return callback(error, []);
        const allowed = addresses.filter((address) => isPublicAddress(address.address));
        if (allowed.length === 0) return callback(new Error("Blocked address"), []);
        callback(null, allowed);
      });
    },
  },
});

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'", apos: "'", nbsp: " " };

// A number that names no character (0, past U+10FFFF, or "&#abc;" without the
// x) stays as written: fromCodePoint would throw, and the database refuses U+0000.
function character(entity: string, code: number) {
  return Number.isInteger(code) && code >= 1 && code <= 0x10ffff ? String.fromCodePoint(code) : entity;
}

function decode(value: string) {
  return value
    .replace(/&(#x?[0-9a-f]+|[a-z]+|#39);/gi, (entity, name: string) => {
      if (name.startsWith("#x")) return character(entity, Number.parseInt(name.slice(2), 16));
      if (name.startsWith("#") && name !== "#39") return character(entity, /^#\d+$/.test(name) ? Number.parseInt(name.slice(1), 10) : Number.NaN);
      return ENTITIES[name.toLowerCase()] ?? entity;
    })
    .replace(/\0/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// Cut by characters, not UTF-16 units: half an emoji is text the database refuses.
const clip = (value: string | undefined, length: number) => (value ? Array.from(value).slice(0, length).join("") : null);

// A quoted value runs to its own closing quote, so "Here's" stays whole.
const attribute = (tag: string, names: string) => {
  const match = tag.match(new RegExp(`\\b(?:${names})\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, "i"));
  return match?.[1] ?? match?.[2];
};

// Image addresses that don't parse, aren't https or are too long to store are
// skipped for the next candidate.
function imageUrl(candidates: (string | undefined)[], pageUrl: string) {
  for (const candidate of candidates) {
    const resolved = candidate ? URL.parse(candidate, pageUrl) : null;
    if (resolved?.protocol === "https:" && resolved.href.length <= 2000) return resolved.href;
  }
  return null;
}

export function parseMetadata(html: string, pageUrl: string): LinkPreview {
  const meta = new Map<string, string>();
  for (const [tag] of html.matchAll(/<meta\b[^>]*>/gi)) {
    const key = attribute(tag, "property|name")?.toLowerCase();
    const content = attribute(tag, "content");
    if (key && content && !meta.has(key)) meta.set(key, decode(content));
  }
  const title = meta.get("og:title") ?? meta.get("twitter:title") ?? decode(html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] ?? "");
  return {
    url: pageUrl,
    title: clip(title, 200),
    description: clip(meta.get("og:description") ?? meta.get("description") ?? meta.get("twitter:description"), 300),
    image: imageUrl([meta.get("og:image:secure_url"), meta.get("og:image"), meta.get("twitter:image")], pageUrl),
    siteName: clip(meta.get("og:site_name"), 80) ?? new URL(pageUrl).hostname.replace(/^www\./, ""),
  };
}

async function readCapped(body: AsyncIterable<Uint8Array>) {
  const decoder = new TextDecoder();
  let html = "";
  let size = 0;
  for await (const chunk of body) {
    size += chunk.byteLength;
    html += decoder.decode(chunk, { stream: true });
    if (size > MAX_BYTES || /<\/head>/i.test(html)) break;
  }
  return html;
}

// "retry" is for failures that may pass later: timeouts, dropped connections,
// a busy or broken server. Anything that can't or mustn't be fetched is "none".
export type LinkFetch = { kind: "found"; preview: LinkPreview } | { kind: "none"; reason: string } | { kind: "retry"; reason: string };

// Video and music pages put their tags far into the page (YouTube's are about
// 770 KB in, past MAX_BYTES), so these sites' cards come from their oEmbed
// answer instead: a few hundred bytes with the title, channel and thumbnail.
const OEMBED: Record<Embed["provider"], string> = {
  YouTube: "https://www.youtube.com/oembed?format=json&url=",
  Vimeo: "https://vimeo.com/api/oembed.json?url=",
  Spotify: "https://open.spotify.com/oembed?url=",
  SoundCloud: "https://soundcloud.com/oembed?format=json&url=",
  TikTok: "https://www.tiktok.com/oembed?url=",
  Loom: "https://www.loom.com/v1/oembed?url=",
};

const oembedAnswer = z.object({
  title: z.string().optional().catch(undefined),
  author_name: z.string().optional().catch(undefined),
  thumbnail_url: z.string().optional().catch(undefined),
});

async function fromOembed(href: string, provider: Embed["provider"]): Promise<LinkPreview | null> {
  try {
    const response = await fetch(`${OEMBED[provider]}${encodeURIComponent(href)}`, {
      dispatcher: agent,
      redirect: "manual",
      signal: AbortSignal.timeout(5000),
      headers: { "user-agent": "MavunoBot/1.0 (+link previews)", accept: "application/json", "accept-language": "en-AU,en;q=0.9" },
    });
    if (!response.ok || !response.body) {
      await response.body?.cancel();
      return null;
    }
    const answer = oembedAnswer.parse(JSON.parse(await readCapped(response.body)));
    const title = clip(answer.title ? decode(answer.title) : undefined, 200);
    if (!title) return null;
    return { url: href, title, description: clip(answer.author_name ? decode(answer.author_name) : undefined, 300), image: imageUrl([answer.thumbnail_url], href), siteName: provider };
  } catch {
    return null;
  }
}

export async function fetchLinkPreview(href: string): Promise<LinkFetch> {
  const embed = embedFor(href);
  const answered = embed ? await fromOembed(href, embed.provider) : null;
  if (answered) return { kind: "found", preview: answered };
  let url = new URL(href);
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (url.protocol !== "https:" && url.protocol !== "http:") return { kind: "none", reason: "Not a web address" };
    if (url.port && url.port !== "80" && url.port !== "443") return { kind: "none", reason: "Unusual port" };
    if (url.username || url.password) return { kind: "none", reason: "Address has a username or password" };
    const host = url.hostname.replace(/^\[|\]$/g, "");
    if (isIP(host) && !isPublicAddress(host)) return { kind: "none", reason: "Blocked address" };
    let response;
    try {
      response = await fetch(url, {
        dispatcher: agent,
        redirect: "manual",
        signal: AbortSignal.timeout(5000),
        // The server is in Mumbai; without this, sites answer in Hindi or with a consent page.
        headers: { "user-agent": "MavunoBot/1.0 (+link previews)", accept: "text/html", "accept-language": "en-AU,en;q=0.9" },
      });
    } catch (error) {
      const blocked = error instanceof Error && /Blocked address/.test(`${error.message} ${String(error.cause)}`);
      return blocked ? { kind: "none", reason: "Blocked address" } : { kind: "retry", reason: "Could not connect" };
    }
    const location = response.headers.get("location");
    if (response.status >= 300 && response.status < 400 && location) {
      await response.body?.cancel();
      const next = URL.parse(location, url);
      if (!next) return { kind: "none", reason: "Bad redirect" };
      url = next;
      continue;
    }
    if (response.status === 429 || response.status >= 500) {
      await response.body?.cancel();
      return { kind: "retry", reason: `HTTP ${response.status}` };
    }
    if (!response.ok || !response.body || !response.headers.get("content-type")?.includes("text/html")) {
      await response.body?.cancel();
      return { kind: "none", reason: response.ok ? "Not a web page" : `HTTP ${response.status}` };
    }
    try {
      const preview = parseMetadata(await readCapped(response.body), url.href);
      return preview.title ? { kind: "found", preview } : { kind: "none", reason: "No title" };
    } catch {
      return { kind: "retry", reason: "Connection dropped" };
    }
  }
  return { kind: "none", reason: "Too many redirects" };
}
