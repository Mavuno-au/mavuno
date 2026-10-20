import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { initialSchedule, scheduledDate, scheduleProblem, utcOffset } from "./schedule";

const zone = process.env.TZ;

describe("scheduling", () => {
  beforeAll(() => {
    process.env.TZ = "Australia/Sydney";
  });
  afterAll(() => {
    process.env.TZ = zone;
  });

  const now = new Date("2026-10-01T10:02:00+10:00");

  it("starts at the top of the next hour", () => {
    expect(initialSchedule(now)).toEqual({ date: "2026-10-01", hour: 11, minute: 0 });
    expect(initialSchedule(new Date("2026-10-01T23:40:00+10:00"))).toEqual({ date: "2026-10-02", hour: 0, minute: 0 });
  });

  it("reads the time in the browser's time zone", () => {
    const when = scheduledDate({ date: "2026-10-05", hour: 9, minute: 30 });
    expect(when.toISOString()).toBe("2026-10-04T22:30:00.000Z");
    expect(utcOffset(when)).toBe("GMT+11");
  });

  it("flags a time skipped when daylight saving starts", () => {
    expect(scheduleProblem({ date: "2026-10-04", hour: 2, minute: 30 }, now)).toMatch(/clocks change/);
    expect(scheduleProblem({ date: "2026-10-04", hour: 3, minute: 0 }, now)).toBeNull();
  });

  it("keeps to the next 30 days", () => {
    expect(scheduleProblem({ date: "2026-10-01", hour: 10, minute: 0 }, now)).toMatch(/future/);
    // Thirty days of 24 hours, so an hour later on the clock once daylight saving starts.
    expect(scheduleProblem({ date: "2026-10-31", hour: 11, minute: 0 }, now)).toBeNull();
    expect(scheduleProblem({ date: "2026-10-31", hour: 11, minute: 5 }, now)).toMatch(/30 days/);
  });
});
