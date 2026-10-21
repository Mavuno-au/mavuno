import { describe, expect, it } from "vitest";
import { anchorFor, findHelp, HELP_ARTICLES, HELP_CATEGORIES, helpHref } from "./help";

describe("findHelp", () => {
  it("matches an article by a word in its title, summary or keywords", () => {
    expect(findHelp("ban").map((article) => article.slug)).toContain("bans");
    expect(findHelp("under 16").map((article) => article.slug)).toEqual(["age-check"]);
    expect(findHelp("How do I DELETE my account?")[0]?.slug).toBe("delete-your-account");
  });

  it("needs every word to match, and ignores single letters", () => {
    expect(findHelp("ban pancakes")).toEqual([]);
    expect(findHelp("a")).toEqual([]);
    expect(findHelp("  ")).toEqual([]);
    expect(findHelp("how do I")).toEqual([]);
  });

  it("caps the list", () => {
    expect(findHelp("account", 2)).toHaveLength(2);
  });
});

describe("articles", () => {
  it("use each slug once and belong to a category", () => {
    expect(new Set(HELP_ARTICLES.map((article) => article.slug)).size).toBe(HELP_ARTICLES.length);
    const categories = new Set<string>(HELP_CATEGORIES.map((category) => category.key));
    expect(HELP_ARTICLES.every((article) => categories.has(article.category))).toBe(true);
  });
});

describe("anchorFor", () => {
  it("turns a heading into a readable address", () => {
    expect(anchorFor("How to appeal")).toBe("how-to-appeal");
    expect(anchorFor("What's in it")).toBe("whats-in-it");
    expect(anchorFor("If your listing wasn’t approved")).toBe("if-your-listing-wasnt-approved");
    expect(helpHref("delete-your-account", "What stays")).toBe("/help/delete-your-account#what-stays");
  });
});
