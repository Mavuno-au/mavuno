import { describe, expect, it } from "vitest";
import { birthDateSchema, deletionDate } from "./age";
import { appealDeadline, appealIsOpen } from "./rules";

describe("birthDateSchema", () => {
  it("turns the three fields into an ISO date", () => {
    expect(birthDateSchema.parse({ day: "7", month: "3", year: "2004" })).toBe("2004-03-07");
  });

  it("refuses dates that don't exist", () => {
    expect(birthDateSchema.safeParse({ day: "31", month: "6", year: "2000" }).success).toBe(false);
    expect(birthDateSchema.safeParse({ day: "29", month: "2", year: "2001" }).success).toBe(false);
    expect(birthDateSchema.parse({ day: "29", month: "2", year: "2004" })).toBe("2004-02-29");
  });

  it("refuses empty, future and implausible dates", () => {
    expect(birthDateSchema.safeParse({ day: "", month: "", year: "" }).success).toBe(false);
    expect(birthDateSchema.safeParse({ day: "1", month: "1", year: String(new Date().getFullYear() + 1) }).success).toBe(false);
    expect(birthDateSchema.safeParse({ day: "1", month: "1", year: "1850" }).success).toBe(false);
  });
});

describe("review and appeal windows", () => {
  it("deletes a deactivated account 30 days on", () => {
    expect(deletionDate("2026-10-20T00:00:00.000Z")).toBe("2026-11-19T00:00:00.000Z");
  });

  it("closes an appeal 30 days after the notice", () => {
    expect(appealDeadline("2026-10-20T10:00:00.000Z")).toBe("2026-11-19T10:00:00.000Z");
    expect(appealIsOpen("2026-10-20T10:00:00.000Z", Date.parse("2026-11-19T09:59:00.000Z"))).toBe(true);
    expect(appealIsOpen("2026-10-20T10:00:00.000Z", Date.parse("2026-11-19T10:01:00.000Z"))).toBe(false);
  });
});
