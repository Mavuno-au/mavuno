import { describe, expect, it } from "vitest";
import { biggestDrop, duration, parseRange, pointsChange } from "./metrics";

describe("parseRange", () => {
  it.each([
    ["7", 7],
    ["30", 30],
    [undefined, 30],
    ["14", 30],
    [["7", "30"], 30],
  ])("reads %j as %d days", (value, expected) => {
    expect(parseRange(value)).toBe(expected);
  });
});

describe("pointsChange", () => {
  it("is the move in whole percentage points", () => {
    expect(pointsChange({ part: 3, whole: 10 }, { part: 1, whole: 4 })).toBe(5);
    expect(pointsChange({ part: 1, whole: 4 }, { part: 1, whole: 2 })).toBe(-25);
  });

  it("is null while either period has nothing to divide by", () => {
    expect(pointsChange({ part: 0, whole: 0 }, { part: 1, whole: 2 })).toBeNull();
    expect(pointsChange({ part: 1, whole: 2 }, { part: 0, whole: 0 })).toBeNull();
  });
});

describe("biggestDrop", () => {
  it("picks the rate that fell furthest", () => {
    expect(
      biggestDrop([
        { key: "activation", points: -3 },
        { key: "answered", points: -12 },
        { key: "retention", points: 8 },
        { key: "conversion", points: null },
      ]),
    ).toBe("answered");
  });

  it("highlights nothing when no rate fell", () => {
    expect(biggestDrop([{ key: "activation", points: 0 }, { key: "answered", points: 4 }])).toBeNull();
  });
});

describe("duration", () => {
  it.each([
    [0.4, "under a minute"],
    [42, "42 min"],
    [95, "1.6 h"],
    [700, "12 h"],
  ])("prints %d minutes as %s", (minutes, expected) => {
    expect(duration(minutes)).toBe(expected);
  });
});
