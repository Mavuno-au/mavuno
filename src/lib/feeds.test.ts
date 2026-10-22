import { describe, expect, it } from "vitest";
import { cursorOf, parseTimeCursor } from "./feeds";

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
