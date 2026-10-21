import { describe, expect, it } from "vitest";
import { authCookieOptions } from "./cookie-options";

describe("authCookieOptions", () => {
  it("marks session cookies Secure on an HTTPS site", () => {
    expect(authCookieOptions("https://mavuno.au")).toEqual({ secure: true });
  });

  it("leaves them usable on a local HTTP server", () => {
    expect(authCookieOptions("http://localhost:3000")).toEqual({ secure: false });
  });
});
