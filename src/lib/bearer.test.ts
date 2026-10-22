import { describe, expect, it } from "vitest";
import { credentials } from "./bearer";

const token = "eyJhbGciOiJFUzI1NiJ9.eyJzdWIiOiIxIn0.c2lnbmF0dXJl";

describe("credentials", () => {
  it("uses the session cookie when there is no Authorization header", () => {
    expect(credentials(null)).toEqual({ kind: "cookie" });
  });

  it("takes a bearer JWT", () => {
    expect(credentials(`Bearer ${token}`)).toEqual({ kind: "bearer", token });
    expect(credentials(`bearer ${token}`)).toEqual({ kind: "bearer", token });
  });

  it("refuses anything else rather than falling back to the cookie", () => {
    expect(credentials("")).toEqual({ kind: "malformed" });
    expect(credentials("Bearer")).toEqual({ kind: "malformed" });
    expect(credentials(`Basic ${token}`)).toEqual({ kind: "malformed" });
    expect(credentials("Bearer sb_publishable_abc123")).toEqual({ kind: "malformed" });
    expect(credentials(`Bearer ${token} extra`)).toEqual({ kind: "malformed" });
    expect(credentials(`Bearer ${"a".repeat(9000)}.b.c`)).toEqual({ kind: "malformed" });
  });
});
