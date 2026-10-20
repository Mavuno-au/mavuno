import { describe, expect, it } from "vitest";
import { isPublicAddress } from "./network";

describe("isPublicAddress", () => {
  it.each(["8.8.8.8", "1.1.1.1", "142.250.70.78", "2606:4700:4700::1111"])("allows %s", (ip) => {
    expect(isPublicAddress(ip)).toBe(true);
  });

  it.each([
    "127.0.0.1",
    "10.1.2.3",
    "172.16.0.1",
    "172.31.255.255",
    "192.168.1.1",
    "169.254.169.254",
    "100.64.0.1",
    "0.0.0.0",
    "224.0.0.1",
    "::1",
    "fd00::1",
    "fe80::1",
    "::ffff:127.0.0.1",
    "not-an-ip",
  ])("blocks %s", (ip) => {
    expect(isPublicAddress(ip)).toBe(false);
  });

  it("does not block neighbours of private ranges", () => {
    expect(isPublicAddress("172.32.0.1")).toBe(true);
    expect(isPublicAddress("11.0.0.1")).toBe(true);
  });
});
