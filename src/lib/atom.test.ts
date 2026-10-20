import { describe, expect, it } from "vitest";
import { atomFeed } from "./atom";

const post = {
  id: "5b1f2b3c-0000-4000-8000-000000000001",
  body: "Jollof <script> & \"fufu\"\u0007",
  language: "en",
  createdAt: "2026-10-20T01:00:00.000Z",
  author: { username: "amara", displayName: "Amara & Co" },
};

describe("atomFeed", () => {
  const xml = atomFeed({
    siteUrl: "https://mavuno.example",
    path: "/@amara",
    title: "Amara & Co",
    updated: "2026-01-01T00:00:00.000Z",
    posts: [post],
  });

  it("escapes text and drops characters XML forbids", () => {
    expect(xml).toContain("<content type=\"text\" xml:lang=\"en\">Jollof &lt;script&gt; &amp; &quot;fufu&quot;</content>");
    expect(xml).toContain("<name>Amara &amp; Co</name>");
  });

  it("links entries and the feed with absolute addresses", () => {
    expect(xml).toContain('<link rel="self" type="application/atom+xml" href="https://mavuno.example/@amara/feed.xml"/>');
    expect(xml).toContain("<id>https://mavuno.example/@amara/posts/5b1f2b3c-0000-4000-8000-000000000001</id>");
  });

  it("is updated as of the newest post", () => {
    expect(xml).toContain("<updated>2026-10-20T01:00:00.000Z</updated>");
  });
});
