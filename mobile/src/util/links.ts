import * as WebBrowser from "expo-web-browser";
import { Alert, Linking, Platform, Share } from "react-native";
import { siteLink } from "@/data/env";

// Only web addresses and email leave the app. Anything else stored in a post
// or a profile, such as a javascript: or custom-scheme address, opens nothing.
const SCHEMES = new Set(["http:", "https:", "mailto:"]);

export function safeHref(href: string): URL | null {
  if (!URL.canParse(href)) return null;
  const url = new URL(href);
  return SCHEMES.has(url.protocol) ? url : null;
}

// Links open in Safari's in-app view, so the reader comes straight back; if
// that can't open, the system handles the address instead.
export function openLink(href: string) {
  const url = safeHref(href);
  if (!url) return;
  const fallback = () => Linking.openURL(url.href).catch(() => undefined);
  if (url.protocol === "mailto:") return void fallback();
  void WebBrowser.openBrowserAsync(url.href, { presentationStyle: WebBrowser.WebBrowserPresentationStyle.PAGE_SHEET }).catch(fallback);
}

// A video or song opens through the system, so iOS hands it to the YouTube
// or Spotify app when it's installed, and to Safari when it isn't.
export function openPlayer(href: string) {
  const url = safeHref(href);
  if (url) void Linking.openURL(url.href).catch(() => openLink(href));
}

const host = (url: URL) => url.hostname.toLowerCase().replace(/^www\./, "");

// "m.youtube.com" is the same site as "youtube.com"; a page may name either.
const sameSite = (a: string, b: string) => a === b || a.endsWith(`.${b}`) || b.endsWith(`.${a}`);

// The site a label claims to be, when it reads as an address: "mavuno.au" or
// "https://mavuno.au/about", but not "Mavuno" or "v2.1".
function claimedHost(label: string) {
  const text = label.trim();
  if (text === "" || /\s/.test(text)) return null;
  const candidate = /^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `https://${text}`;
  if (!URL.canParse(candidate)) return null;
  const claimed = host(new URL(candidate));
  return /^[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/.test(claimed) ? claimed : null;
}

// A label that names one site while the address goes to another is how a
// phishing link hides. The reader sees where it really goes before it opens.
export function labelMisleads(label: string, href: string) {
  const url = safeHref(href);
  const claimed = claimedHost(label);
  return url !== null && url.protocol !== "mailto:" && claimed !== null && !sameSite(claimed, host(url));
}

export function openLabelledLink(href: string, label: string) {
  const url = safeHref(href);
  if (!url) return;
  if (!labelMisleads(label, href)) return openLink(href);
  const destination = host(url);
  Alert.alert("This link goes somewhere else", `It says “${label.trim()}” but opens ${destination}.`, [
    { text: "Cancel", style: "cancel" },
    { text: `Open ${destination}`, onPress: () => openLink(href) },
  ]);
}

export const postLink = (post: { id: string; author: { username: string } }) => siteLink(`/@${post.author.username}/posts/${post.id}`);
export const profileLink = (username: string) => siteLink(`/@${username}`);

// The design turns the website's Copy link into the share sheet.
export function shareLink(url: string) {
  void Share.share(Platform.OS === "ios" ? { url } : { message: url });
}
