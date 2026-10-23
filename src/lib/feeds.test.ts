import { describe, expect, it } from "vitest";
import { cursorOf, feedPage, parseTimeCursor } from "./feeds";

const id = "a0000000-0000-4000-8000-000000000001";

describe("time cursors", () => {
  it("reads back the time and id they were made from", () => {
    const time = "2026-10-20T01:00:00.123456+00:00";
    expect(parseTimeCursor(cursorOf(time, id))).toEqual({ key: time, id });
  });

  it("reads no cursor as the first page", () => {
    expect(parseTimeCursor(null)).toBeNull();
  });

  it("refuses a cursor that isn't a time and an id", () => {
    expect(() => parseTimeCursor(`yesterday:${id}`)).toThrow();
    expect(() => parseTimeCursor("2026-10-20T01:00:00Z")).toThrow();
  });
});

describe("feedPage", () => {
  const row = (n: number) => ({ id: `a0000000-0000-4000-8000-${String(n).padStart(12, "0")}`, created_at: `2026-10-20T01:00:${String(59 - n).padStart(2, "0")}Z`, published_at: null });
  const page = Array.from({ length: 20 }, (_, n) => row(n + 1));
  // The parse stands in for the app's lenient one, here dropping every row it was given.
  it("keeps paging when the app drops rows it can't read", () => {
    expect(feedPage({ kind: "latest" }, page, () => []).next).toBe(cursorOf(page[19]?.created_at ?? "", page[19]?.id ?? ""));
  });

  it("ends on a short page", () => {
    expect(feedPage({ kind: "latest" }, page.slice(0, 5), () => []).next).toBeNull();
  });
});
