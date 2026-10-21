import { describe, expect, it } from "vitest";
import { isPublicAddress } from "./network";

// Hosts as a URL hands them over, so the test sees the spelling Node normalises to.
const host = (url: string) => new URL(url).hostname.replace(/^\[|\]$/g, "");

describe("isPublicAddress", () => {
  it.each(["8.8.8.8", "1.1.1.1", "142.250.70.78", "2606:4700:4700::1111", "2001:4860:4860::8888", "2404:6800:4006:80a::200e"])("allows %s", (ip) => {
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
    "255.255.255.255",
    "192.0.2.10",
    "198.51.100.7",
    "203.0.113.9",
    "192.88.99.1",
    "198.18.0.1",
    "::",
    "::1",
    "fd00::1",
    "fe80::1",
    "fe80::1%eth0",
    "fec0::1",
    "ff02::1",
    "::ffff:127.0.0.1",
    "::ffff:7f00:1",
    "0:0:0:0:0:ffff:a9fe:a9fe",
    "::ffff:0:a00:1",
    "::7f00:1",
    "::127.0.0.1",
    "64:ff9b::7f00:1",
    "64:ff9b:1::1",
    "100::1",
    "2001::1",
    "2001:0:4136:e378:8000:63bf:3fff:fdd2",
    "2001:db8::1",
    "2002:7f00:1::",
    "2002:a9fe:a9fe::1",
    "3fff::1",
    "not-an-ip",
    "",
  ])("blocks %s", (ip) => {
    expect(isPublicAddress(ip)).toBe(false);
  });

  it.each([
    "http://[::ffff:127.0.0.1]/",
    "http://[::ffff:169.254.169.254]/",
    "http://[::ffff:10.0.0.1]/",
    "http://[0:0:0:0:0:ffff:127.0.0.1]/",
    "http://[::127.0.0.1]/",
    "http://[2002:7f00:1::]/",
    "http://[fec0::1]/",
    "http://[100::1]/",
    "http://2130706433/",
    "http://0x7f.1/",
    "http://017700000001/",
  ])("blocks the host of %s however the URL parser spells it", (url) => {
    expect(isPublicAddress(host(url))).toBe(false);
  });

  it("does not block neighbours of private ranges", () => {
    expect(isPublicAddress("172.32.0.1")).toBe(true);
    expect(isPublicAddress("11.0.0.1")).toBe(true);
    expect(isPublicAddress("2001:200::1")).toBe(true);
    expect(isPublicAddress("2003::1")).toBe(true);
  });
});
