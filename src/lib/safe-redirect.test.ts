import { describe, expect, it } from "vitest";
import { safeNext } from "./safe-redirect";

describe("safeNext", () => {
  it("keeps same-site paths", () => {
    expect(safeNext("/@amara/replies")).toBe("/@amara/replies");
    expect(safeNext("/search?q=jollof%20rice")).toBe("/search?q=jollof%20rice");
  });

  it.each(["https://evil.example", "//evil.example", "/\\evil.example", "/\t/evil.example", "/\n/evil.example", "/ /evil.example", "javascript:alert(1)", undefined, 42])("rejects %s", (value) => {
    expect(safeNext(value)).toBe("/");
  });
});
