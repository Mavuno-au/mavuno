import "server-only";
import { lookup } from "node:dns";
import { isIP } from "node:net";
import { Agent, fetch } from "undici";
import { isPublicAddress } from "@/lib/network";
import type { LinkPreview } from "@/lib/domain";

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

function decode(value: string) {
  return value
    .replace(/&(#x?[0-9a-f]+|[a-z]+|#39);/gi, (entity, name: string) => {
      if (name.startsWith("#x")) return String.fromCodePoint(Number.parseInt(name.slice(2), 16));
      if (name.startsWith("#") && name !== "#39") return String.fromCodePoint(Number.parseInt(name.slice(1), 10));
      return ENTITIES[name.toLowerCase()] ?? entity;
    })
    .replace(/\s+/g, " ")
    .trim();
}

export function parseMetadata(html: string, pageUrl: string): LinkPreview {
  const meta = new Map<string, string>();
  for (const [tag] of html.matchAll(/<meta\b[^>]*>/gi)) {
    const key = tag.match(/\b(?:property|name)\s*=\s*["']([^"']+)["']/i)?.[1]?.toLowerCase();
    const content = tag.match(/\bcontent\s*=\s*["']([^"']*)["']/i)?.[1];
    if (key && content && !meta.has(key)) meta.set(key, decode(content));
  }
  const title = meta.get("og:title") ?? meta.get("twitter:title") ?? decode(html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] ?? "");
  const rawImage = meta.get("og:image") ?? meta.get("twitter:image");
  let image: string | null = null;
  if (rawImage) {
    const resolved = new URL(rawImage, pageUrl);
    if (resolved.protocol === "https:") image = resolved.href;
  }
  return {
    url: pageUrl,
    title: title ? title.slice(0, 200) : null,
    description: (meta.get("og:description") ?? meta.get("description") ?? meta.get("twitter:description"))?.slice(0, 300) ?? null,
    image,
    siteName: meta.get("og:site_name")?.slice(0, 80) ?? new URL(pageUrl).hostname.replace(/^www\./, ""),
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

export async function fetchLinkPreview(href: string): Promise<LinkPreview | null> {
  let url = new URL(href);
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    if (url.port && url.port !== "80" && url.port !== "443") return null;
    const host = url.hostname.replace(/^\[|\]$/g, "");
    if (isIP(host) && !isPublicAddress(host)) return null;
    try {
      const response = await fetch(url, {
        dispatcher: agent,
        redirect: "manual",
        signal: AbortSignal.timeout(5000),
        headers: { "user-agent": "MavunoBot/1.0 (+link previews)", accept: "text/html" },
      });
      const location = response.headers.get("location");
      if (response.status >= 300 && response.status < 400 && location) {
        await response.body?.cancel();
        url = new URL(location, url);
        continue;
      }
      if (!response.ok || !response.body || !response.headers.get("content-type")?.includes("text/html")) {
        await response.body?.cancel();
        return null;
      }
      const preview = parseMetadata(await readCapped(response.body), url.href);
      return preview.title ? preview : null;
    } catch {
      return null;
    }
  }
  return null;
}
