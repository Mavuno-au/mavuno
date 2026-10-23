import { describe, expect, it } from "vitest";
import { appReleaseSchema } from "./app-release";

describe("appReleaseSchema", () => {
  it("lets the first release gate nothing without a store link", () => {
    expect(appReleaseSchema.safeParse({ minimumBuild: 1, storeUrl: null }).success).toBe(true);
  });

  it("refuses a minimum build with nowhere to update from", () => {
    expect(appReleaseSchema.safeParse({ minimumBuild: 7, storeUrl: null }).success).toBe(false);
    expect(appReleaseSchema.safeParse({ minimumBuild: 7, storeUrl: "https://apps.apple.com/au/app/mavuno/id1" }).success).toBe(true);
  });
});
