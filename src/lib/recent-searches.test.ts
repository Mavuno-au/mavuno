import { describe, expect, it } from "vitest";
import { rememberSearch } from "./recent-searches";

describe("rememberSearch", () => {
  it("keeps the newest three, without repeats in another case", () => {
    expect(rememberSearch([], "jollof")).toEqual(["jollof"]);
    expect(rememberSearch(["jollof", "brisbane"], "Jollof ")).toEqual(["Jollof", "brisbane"]);
    expect(rememberSearch(["a", "b", "c"], "d")).toEqual(["d", "a", "b"]);
  });

  it("never keeps a term that looks like personal details, or an empty one", () => {
    expect(rememberSearch(["jollof"], "0412 345 678")).toEqual(["jollof"]);
    expect(rememberSearch(["jollof"], "amara@example.com")).toEqual(["jollof"]);
    expect(rememberSearch(["jollof"], "   ")).toEqual(["jollof"]);
    expect(rememberSearch([], "x".repeat(101))).toEqual([]);
  });
});
