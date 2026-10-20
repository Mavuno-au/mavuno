import { isIP } from "node:net";

const BLOCKED_V4: [number, number][] = [
  [0x00000000, 8], // this network
  [0x0a000000, 8], // private
  [0x64400000, 10], // carrier-grade NAT
  [0x7f000000, 8], // loopback
  [0xa9fe0000, 16], // link-local, cloud metadata
  [0xac100000, 12], // private
  [0xc0000000, 24], // IETF protocol assignments
  [0xc0a80000, 16], // private
  [0xc6120000, 15], // benchmarking
  [0xe0000000, 3], // multicast and reserved
];

function v4ToInt(ip: string) {
  return ip.split(".").reduce((value, part) => (value << 8) + Number(part), 0) >>> 0;
}

function isBlockedV4(ip: string) {
  const value = v4ToInt(ip);
  return BLOCKED_V4.some(([base, bits]) => (value & (~0 << (32 - bits))) >>> 0 === base);
}

// Whether a server-side request to this address could only reach the public
// internet, never the host itself or a private network.
export function isPublicAddress(ip: string) {
  const version = isIP(ip);
  if (version === 4) return !isBlockedV4(ip);
  if (version !== 6) return false;
  const lower = ip.toLowerCase();
  const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped?.[1]) return !isBlockedV4(mapped[1]);
  return !(
    lower === "::" ||
    lower === "::1" ||
    /^f[cd]/.test(lower) ||
    /^fe[89ab]/.test(lower) ||
    lower.startsWith("ff") ||
    lower.startsWith("64:ff9b:") ||
    lower.startsWith("2001:db8")
  );
}
