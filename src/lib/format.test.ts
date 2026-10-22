import { describe, expect, it } from "vitest";
import { count, dayLabel, followedBy, pollTimeLeft, relativeTime } from "./format";

const now = new Date("2026-10-20T01:00:00Z").getTime();
const ago = (ms: number) => new Date(now - ms).toISOString();

describe("relativeTime", () => {
  it.each([
    [10_000, "now"],
    [5 * 60_000, "5m"],
    [3 * 3_600_000, "3h"],
    [2 * 86_400_000, "2d"],
  ])("prints %d ms ago as %s", (ms, expected) => {
    expect(relativeTime(ago(ms), now)).toBe(expected);
  });

  it("prints a date after a week, with the year only when it differs", () => {
    expect(relativeTime("2026-10-01T01:00:00Z", now)).toBe("1 Oct");
    expect(relativeTime("2025-03-04T01:00:00Z", now)).toBe("4 Mar 2025");
  });
});

describe("dayLabel", () => {
  it("names today and yesterday in Australian time", () => {
    expect(dayLabel("2026-10-19T22:00:00Z", new Date(now))).toBe("Today");
    expect(dayLabel("2026-10-19T12:00:00Z", new Date(now))).toBe("Yesterday");
    expect(dayLabel("2026-10-17T12:00:00Z", new Date(now))).toBe("Sat, 17 Oct");
  });
});

describe("count", () => {
  it("pluralises", () => {
    expect(count(1, "reply", "replies")).toBe("1 reply");
    expect(count(2, "reply", "replies")).toBe("2 replies");
    expect(count(1500, "follower")).toBe("1.5K followers");
  });
});

describe("followedBy", () => {
  it.each([
    [["Ada"], 1, "Followed by Ada"],
    [["Ada", "Ben"], 2, "Followed by Ada and Ben"],
    [["Ada", "Ben", "Cam"], 3, "Followed by Ada, Ben and Cam"],
    [["Ada", "Ben", "Cam"], 4, "Followed by Ada, Ben and 2 others you follow"],
    [["Ada", "Ben", "Cam"], 7, "Followed by Ada, Ben and 5 others you follow"],
    [[], 0, null],
  ])("names %j of %d", (names, total, expected) => {
    expect(followedBy(names, total)).toBe(expected);
  });
});

describe("pollTimeLeft", () => {
  const later = (ms: number) => new Date(now + ms).toISOString();

  it.each([
    [null, "Opens when published"],
    [later(-1), "Final results"],
    [later(30_000), "1m left"],
    [later(45 * 60_000), "45m left"],
    [later(5 * 3_600_000), "5h left"],
    [later(3 * 86_400_000), "3d left"],
  ])("prints %s as %s", (closesAt, expected) => {
    expect(pollTimeLeft(closesAt, now)).toBe(expected);
  });
});
