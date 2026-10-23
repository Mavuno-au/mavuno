import { describe, expect, it } from "vitest";
import { sentSecret } from "./cron-secret";

describe("sentSecret", () => {
  it("accepts the secret as a bearer token", () => {
    expect(sentSecret("Bearer s3cret", "s3cret")).toBe(true);
  });

  it("refuses anything else", () => {
    expect(sentSecret(null, "s3cret")).toBe(false);
    expect(sentSecret("", "s3cret")).toBe(false);
    expect(sentSecret("s3cret", "s3cret")).toBe(false);
    expect(sentSecret("Bearer s3cre", "s3cret")).toBe(false);
    expect(sentSecret("Bearer s3cret ", "s3cret")).toBe(false);
    expect(sentSecret("Bearer other", "s3cret")).toBe(false);
  });
});
