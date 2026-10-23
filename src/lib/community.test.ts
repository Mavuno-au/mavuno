import { describe, expect, it } from "vitest";
import { localTimeSchema } from "./community";

describe("localTimeSchema", () => {
  it("takes a real date and time", () => {
    expect(localTimeSchema.safeParse("2026-11-01T18:30").success).toBe(true);
  });

  it.each(["2026-02-30T10:00", "2026-13-01T25:00", "tomorrow"])("refuses %s rather than rolling it over or throwing", (value) => {
    expect(localTimeSchema.safeParse(value).success).toBe(false);
  });
});
