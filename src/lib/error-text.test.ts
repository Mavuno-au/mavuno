import { describe, expect, it } from "vitest";
import { errorDigest, errorSummary } from "./error-text";

describe("errorSummary", () => {
  it("keeps the first line only", () => {
    expect(errorSummary("Feed failed: timeout\n    at loadFeed (posts.ts:62)")).toBe("Feed failed: timeout");
  });

  it("takes out addresses, ids, numbers and tokens", () => {
    expect(errorSummary("duplicate key for amara@example.com in 6f1d4c1e-5b1a-4f0e-9a51-2a4c6a1d9b10")).toBe("duplicate key for [email] in [id]");
    expect(errorSummary("card 4111 1111 1111 1111 rejected; Bearer abc.def")).toBe("card [number] rejected; [token]");
    expect(errorSummary("called 0412 345 678 with token=abc")).toBe("called [number] with [token]");
  });

  it("leaves short numbers and ordinary words alone", () => {
    expect(errorSummary("Expected 3 posts, got 10 (HTTP 503)")).toBe("Expected 3 posts, got 10 (HTTP 503)");
  });

  it("cuts long messages and never returns nothing", () => {
    expect(errorSummary("x".repeat(400))).toHaveLength(300);
    expect(errorSummary("\n  \n")).toBe("Error");
  });
});

describe("errorDigest", () => {
  it("reads Next's digest when there is one", () => {
    expect(errorDigest(Object.assign(new Error("boom"), { digest: "123" }))).toBe("123");
    expect(errorDigest(new Error("boom"))).toBeNull();
    expect(errorDigest("boom")).toBeNull();
  });
});
