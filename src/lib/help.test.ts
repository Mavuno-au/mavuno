import { describe, expect, it } from "vitest";
import { findHelp, HELP_TOPICS } from "./help";

describe("findHelp", () => {
  it("matches a question by a word in it or a keyword", () => {
    expect(findHelp("ban").map((topic) => topic.slug)).toContain("banned");
    expect(findHelp("under 16").map((topic) => topic.slug)).toEqual(["age"]);
    expect(findHelp("DELETE my account")[0]?.slug).toBe("delete-account");
  });

  it("needs every word to match, and ignores single letters", () => {
    expect(findHelp("ban pancakes")).toEqual([]);
    expect(findHelp("a")).toEqual([]);
    expect(findHelp("  ")).toEqual([]);
  });

  it("caps the list", () => {
    expect(findHelp("my", 2)).toHaveLength(2);
  });

  it("uses each slug once", () => {
    expect(new Set(HELP_TOPICS.map((topic) => topic.slug)).size).toBe(HELP_TOPICS.length);
  });
});
