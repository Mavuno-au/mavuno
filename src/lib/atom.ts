import type { Post } from "@/lib/domain";

type FeedPost = Pick<Post, "id" | "body" | "language" | "createdAt"> & { author: Pick<Post["author"], "username" | "displayName"> };

const escapeXml = (text: string) =>
  text
    // Characters XML 1.0 does not allow at all.
    .replace(/[^\u0009\u000A\u000D -퟿-�\u{10000}-\u{10FFFF}]/gu, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

function entryTitle(body: string) {
  const flat = body.replace(/\s+/g, " ").trim();
  if (!flat) return "Photo";
  return flat.length > 80 ? `${flat.slice(0, 79)}…` : flat;
}

// An Atom feed of posts (RFC 4287). Bodies go out as plain text, so readers
// show exactly what the author wrote.
export function atomFeed({ siteUrl, path, title, subtitle, updated, posts }: { siteUrl: string; path: string; title: string; subtitle?: string; updated: string; posts: FeedPost[] }) {
  const absoluteUrl = (to: string) => new URL(to, siteUrl).href;
  const url = absoluteUrl(path);
  const entries = posts.map((post) => {
    const link = absoluteUrl(`/@${post.author.username}/posts/${post.id}`);
    return [
      "  <entry>",
      `    <id>${escapeXml(link)}</id>`,
      `    <title>${escapeXml(entryTitle(post.body))}</title>`,
      `    <link rel="alternate" type="text/html" href="${escapeXml(link)}"/>`,
      `    <published>${escapeXml(post.createdAt)}</published>`,
      `    <updated>${escapeXml(post.createdAt)}</updated>`,
      `    <author><name>${escapeXml(post.author.displayName)}</name><uri>${escapeXml(absoluteUrl(`/@${post.author.username}`))}</uri></author>`,
      `    <content type="text" xml:lang="${escapeXml(post.language)}">${escapeXml(post.body)}</content>`,
      "  </entry>",
    ].join("\n");
  });
  return [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<feed xmlns="http://www.w3.org/2005/Atom">',
    `  <id>${escapeXml(url)}</id>`,
    `  <title>${escapeXml(title)}</title>`,
    ...(subtitle ? [`  <subtitle>${escapeXml(subtitle)}</subtitle>`] : []),
    `  <link rel="self" type="application/atom+xml" href="${escapeXml(`${url}/feed.xml`)}"/>`,
    `  <link rel="alternate" type="text/html" href="${escapeXml(url)}"/>`,
    `  <updated>${escapeXml(posts[0]?.createdAt ?? updated)}</updated>`,
    `  <icon>${escapeXml(absoluteUrl("/icon.svg"))}</icon>`,
    "  <generator>Mavuno</generator>",
    ...entries,
    "</feed>",
    "",
  ].join("\n");
}

export const atomResponse = (xml: string) =>
  new Response(xml, { headers: { "Content-Type": "application/atom+xml; charset=utf-8", "Cache-Control": "public, max-age=600, s-maxage=600" } });
