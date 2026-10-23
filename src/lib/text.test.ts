import { describe, expect, it } from "vitest";
import { allUrls, displayUrl, firstUrl, foldBody, foldsInLists, initials, tokenize } from "./text";

describe("tokenize", () => {
  it("finds mentions, topics and links in order", () => {
    expect(tokenize("Hi @Kofi, see #AfroFest at https://example.org/x.")).toEqual([
      { kind: "text", text: "Hi " },
      { kind: "mention", text: "@Kofi", username: "kofi" },
      { kind: "text", text: ", see " },
      { kind: "topic", text: "#AfroFest", topic: "afrofest" },
      { kind: "text", text: " at " },
      { kind: "url", text: "https://example.org/x", href: "https://example.org/x" },
      { kind: "text", text: "." },
    ]);
  });

  it("does not treat email addresses or scoped packages as mentions", () => {
    const kinds = tokenize("mail amara@example.com or npm i @scope/pkg").map((s) => s.kind);
    expect(kinds).toEqual(["text"]);
  });

  it("keeps balanced parentheses in links and drops the closing one around them", () => {
    const segments = tokenize("(see https://en.wikipedia.org/wiki/Jollof_(dish))");
    expect(segments.find((s) => s.kind === "url")).toMatchObject({ href: "https://en.wikipedia.org/wiki/Jollof_(dish)" });
  });

  it("ends links at an ellipsis or curly quotes", () => {
    expect(firstUrl("Read https://example.org/story… then tell me")).toBe("https://example.org/story");
    expect(firstUrl("She said “see https://example.org/a”.")).toBe("https://example.org/a");
    expect(firstUrl("It’s at ‘https://example.org/b’, I think")).toBe("https://example.org/b");
    expect(firstUrl("www.mavuno.au’s new look")).toBe("https://www.mavuno.au");
    expect(tokenize("https://example.org/x…")).toEqual([
      { kind: "url", text: "https://example.org/x", href: "https://example.org/x" },
      { kind: "text", text: "…" },
    ]);
  });

  it("links bare www addresses over https", () => {
    expect(firstUrl("visit www.mavuno.au today")).toBe("https://www.mavuno.au");
  });

  it("ignores hashtags inside words and URLs", () => {
    expect(tokenize("C#sharp and Q&#A").every((s) => s.kind === "text")).toBe(true);
  });
});

describe("malformed links", () => {
  it("stay text, so displaying them can't throw", () => {
    for (const body of ["see http://a:99999 now", "http://[x", "https://exa mple"]) {
      const segments = tokenize(body);
      for (const segment of segments) if (segment.kind === "url") expect(() => displayUrl(segment.href)).not.toThrow();
    }
    expect(tokenize("http://a:99999").every((segment) => segment.kind === "text")).toBe(true);
  });
});

describe("displayUrl", () => {
  it("drops the protocol and www and shortens long links", () => {
    expect(displayUrl("https://www.example.org/")).toBe("example.org");
    expect(displayUrl("https://example.org/a/very/long/path/that/keeps/going/on")).toHaveLength(40);
  });
});

describe("foldBody", () => {
  it("leaves short posts whole", () => {
    expect(foldBody("a".repeat(280))).toEqual({ folded: false });
    expect(foldBody("line\n".repeat(7).trim())).toEqual({ folded: false });
  });

  it("cuts long posts at a word boundary near 280 characters", () => {
    const result = foldBody(`${"word ".repeat(80)}end`);
    expect(result.folded).toBe(true);
    if (result.folded) {
      expect(result.preview.length).toBeLessThanOrEqual(281);
      expect(result.preview.endsWith("word…")).toBe(true);
    }
  });

  it("cuts after 8 lines", () => {
    const result = foldBody(Array.from({ length: 12 }, (_, i) => `line ${i}`).join("\n"));
    expect(result).toEqual({ folded: true, preview: `${Array.from({ length: 8 }, (_, i) => `line ${i}`).join("\n")}…` });
  });
});

describe("allUrls", () => {
  it("lists each distinct link once, in the order written", () => {
    expect(allUrls("See https://example.org/a and www.example.org/b, then https://example.org/a again")).toEqual(["https://example.org/a", "https://www.example.org/b"]);
  });

  it("is empty without links", () => {
    expect(allUrls("Nothing to see @here #today")).toEqual([]);
  });
});

describe("foldsInLists", () => {
  it("says whether a post will fold behind Show more", () => {
    expect(foldsInLists("Short and sweet")).toBe(false);
    expect(foldsInLists("word ".repeat(70))).toBe(true);
    expect(foldsInLists(Array.from({ length: 9 }, (_, i) => `line ${i}`).join("\n"))).toBe(true);
  });
});

describe("displayUrl", () => {
  it("shortens a parseable link", () => {
    expect(displayUrl("https://www.example.org/jobs?x=1")).toBe("example.org/jobs?x=1");
  });
  it("shows an unparseable stored link as written instead of throwing", () => {
    expect(displayUrl("https://a:99999")).toBe("https://a:99999");
    expect(displayUrl("https://%")).toBe("https://%");
  });
});

describe("initials", () => {
  it("never splits an emoji", () => {
    expect(initials("😀 Ama")).toBe("😀A");
    expect(initials("Kofi Mensah")).toBe("KM");
  });
});
