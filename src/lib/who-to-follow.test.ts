import { describe, expect, it } from "vitest";
import { parseRound, spareSuggestions, suggestionDay, suggestionPages } from "./who-to-follow";

const network = ["n1", "n2", "n3", "n4", "n5"];
const popular = ["p1", "p2", "p3", "p4", "p5", "p6", "p7"];

describe("suggestionPages", () => {
  it("gives the same pages for the same seed and different ones for another day", () => {
    expect(suggestionPages(network, popular, 3, "me:2026-10-20")).toEqual(suggestionPages(network, popular, 3, "me:2026-10-20"));
    expect(suggestionPages(network, popular, 3, "me:2026-10-20")).not.toEqual(suggestionPages(network, popular, 3, "me:2026-10-21"));
  });

  it("shows everyone once, mixing both pools on full pages", () => {
    const pages = suggestionPages(network, popular, 3, "seed");
    const shown = pages.flat();
    expect(new Set(shown)).toEqual(new Set([...network, ...popular]));
    expect(pages.every((page) => page.length === 3)).toBe(true);
    const first = pages[0] ?? [];
    expect(first.some((id) => id.startsWith("n")) && first.some((id) => id.startsWith("p"))).toBe(true);
  });

  it("takes the network best first", () => {
    const byPage = suggestionPages(network, popular, 3, "seed").flatMap((page) => page.filter((id) => id.startsWith("n")).toSorted());
    expect(byPage).toEqual(network);
  });

  it("fills from one side when the other is empty", () => {
    expect(suggestionPages([], popular, 3, "seed").flat()).toHaveLength(9);
    expect(suggestionPages(network, [], 3, "seed")[0]?.toSorted()).toEqual(["n1", "n2", "n3"]);
    expect(suggestionPages([], [], 3, "seed")).toEqual([[]]);
  });
});

describe("parseRound", () => {
  it("keeps today's round and starts again on another day", () => {
    expect(parseRound("2026-10-20.4", "2026-10-20")).toBe(4);
    expect(parseRound("2026-10-19.4", "2026-10-20")).toBe(0);
    expect(parseRound("nonsense", "2026-10-20")).toBe(0);
    expect(parseRound(undefined, "2026-10-20")).toBe(0);
  });
});

describe("suggestionDay", () => {
  it("uses the date in Sydney", () => {
    expect(suggestionDay(new Date("2026-10-20T14:00:00Z"))).toBe("2026-10-21");
  });
});

describe("spareSuggestions", () => {
  const person = (id: string) => ({ id });
  const pages = [["a", "b", "c"], ["d", "e", "f"], ["g", "a", "b"]].map((page) => page.map(person));

  it("takes people from the following pages, nearest first, skipping anyone on the page", () => {
    expect(spareSuggestions(pages, 0, 3).map((p) => p.id)).toEqual(["d", "e", "f"]);
    expect(spareSuggestions(pages, 2, 3).map((p) => p.id)).toEqual(["c", "d", "e"]);
    expect(spareSuggestions(pages, 1, 5).map((p) => p.id)).toEqual(["g", "a", "b", "c"]);
  });

  it("has nobody spare when there is only one page", () => {
    expect(spareSuggestions([pages[0] ?? []], 0, 3)).toEqual([]);
  });
});
