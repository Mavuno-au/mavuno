export type Segment =
  | { kind: "text"; text: string }
  | { kind: "url"; text: string; href: string }
  | { kind: "mention"; text: string; username: string }
  | { kind: "topic"; text: string; topic: string };

// Mirrors public.extract_mentions and public.extract_topics in the database:
// no mentions inside email addresses or scoped package names like @scope/pkg.
// Curly quotes and an ellipsis end a link: phones type them straight after one.
const TOKEN =
  /(?<url>\bhttps?:\/\/[^\s<>"'“”‘’…]+|\bwww\.[a-z0-9-]+\.[^\s<>"'“”‘’…]+)|(?<![A-Za-z0-9_.@/])@(?<mention>[A-Za-z0-9_]{3,30})(?![A-Za-z0-9_/.-]*[A-Za-z0-9])|(?<![A-Za-z0-9_&/])#(?<topic>[A-Za-z][A-Za-z0-9_]{1,39})/gi;

const TRAILING_PUNCTUATION = /[.,;:!?'"\]]+$/;

function trimUrl(raw: string) {
  let url = raw.replace(TRAILING_PUNCTUATION, "");
  while (url.endsWith(")") && (url.match(/\(/g)?.length ?? 0) < (url.match(/\)/g)?.length ?? 0)) {
    url = url.slice(0, -1).replace(TRAILING_PUNCTUATION, "");
  }
  return url;
}

export function tokenize(body: string): Segment[] {
  const segments: Segment[] = [];
  let cursor = 0;
  const pushText = (text: string) => {
    if (!text) return;
    const last = segments.at(-1);
    if (last?.kind === "text") last.text += text;
    else segments.push({ kind: "text", text });
  };

  for (const match of body.matchAll(TOKEN)) {
    const start = match.index;
    const { url, mention, topic } = match.groups ?? {};
    pushText(body.slice(cursor, start));
    if (url) {
      const text = trimUrl(url);
      const href = text.startsWith("www.") ? `https://${text}` : text;
      // Something shaped like a link but not one (http://a:99999) stays text.
      if (URL.canParse(href)) segments.push({ kind: "url", text, href });
      else pushText(text);
      cursor = start + text.length;
      continue;
    }
    if (mention) segments.push({ kind: "mention", text: match[0], username: mention.toLowerCase() });
    else if (topic) segments.push({ kind: "topic", text: match[0], topic: topic.toLowerCase() });
    cursor = start + match[0].length;
  }
  pushText(body.slice(cursor));
  return segments;
}

export function firstUrl(body: string) {
  return tokenize(body).find((segment) => segment.kind === "url")?.href ?? null;
}

// Every distinct link in the body, in the order written: the choices for a card.
export function allUrls(body: string) {
  return [...new Set(tokenize(body).flatMap((segment) => (segment.kind === "url" ? [segment.href] : [])))];
}

export function displayUrl(href: string) {
  // A stored address the browser cannot parse is shown as written rather than
  // aborting the page for whoever is reading it.
  if (!URL.canParse(href)) return href.length > 40 ? `${href.slice(0, 39)}…` : href;
  const { host, pathname, search } = new URL(href);
  const rest = `${pathname === "/" ? "" : pathname}${search}`;
  const shown = host.replace(/^www\./, "") + rest;
  return shown.length > 40 ? `${shown.slice(0, 39)}…` : shown;
}

const FOLD_CHARACTERS = 280;
const FOLD_LINES = 8;

export const FOLD_HINT = `Feeds show the first ${FOLD_CHARACTERS} characters or ${FOLD_LINES} lines, then Show more.`;

// Long posts fold behind "Show more" in lists: the preview stops at a word
// boundary near 280 characters or after 8 lines, whichever comes first.
export function foldBody(body: string): { folded: false } | { folded: true; preview: string } {
  const lines = body.split("\n");
  let preview = lines.length > FOLD_LINES ? lines.slice(0, FOLD_LINES).join("\n") : body;
  if (preview.length > FOLD_CHARACTERS) {
    const cut = preview.slice(0, FOLD_CHARACTERS);
    const space = cut.search(/\s\S*$/);
    preview = space > FOLD_CHARACTERS * 0.6 ? cut.slice(0, space) : cut;
  }
  if (preview.length >= body.length) return { folded: false };
  return { folded: true, preview: `${preview.trimEnd()}…` };
}

export function foldsInLists(body: string) {
  return foldBody(body).folded;
}
