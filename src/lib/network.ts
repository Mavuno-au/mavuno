import { isIP } from "node:net";

type Range = [string, number];

const BLOCKED_V4: Range[] = [
  ["0.0.0.0", 8], // this network
  ["10.0.0.0", 8], // private
  ["100.64.0.0", 10], // carrier-grade NAT
  ["127.0.0.0", 8], // loopback
  ["169.254.0.0", 16], // link-local, cloud metadata
  ["172.16.0.0", 12], // private
  ["192.0.0.0", 24], // IETF protocol assignments
  ["192.0.2.0", 24], // documentation
  ["192.88.99.0", 24], // 6to4 relays
  ["192.168.0.0", 16], // private
  ["198.18.0.0", 15], // benchmarking
  ["198.51.100.0", 24], // documentation
  ["203.0.113.0", 24], // documentation
  ["224.0.0.0", 3], // multicast and reserved
];

// Everything outside global unicast (2000::/3) is refused outright: loopback,
// IPv4-mapped and -compatible forms, NAT64, discard, unique local, link- and
// site-local, multicast. These are the parts of 2000::/3 that still tunnel to
// or stand for someone else's address.
const GLOBAL_V6: Range = ["2000::", 3];
const BLOCKED_V6: Range[] = [
  ["2001::", 23], // IETF protocol assignments, Teredo among them
  ["2001:db8::", 32], // documentation
  ["2002::", 16], // 6to4
  ["3fff::", 20], // documentation
];

// An address as 16-bit words, so every spelling of it compares the same.
function words(ip: string): number[] {
  if (isIP(ip) === 4) {
    const [a = 0, b = 0, c = 0, d = 0] = ip.split(".").map(Number);
    return [(a << 8) | b, (c << 8) | d];
  }
  let text = ip.split("%")[0] ?? "";
  const dotted = text.match(/(\d+\.\d+\.\d+\.\d+)$/)?.[1];
  if (dotted) text = text.slice(0, -dotted.length) + words(dotted).map((word) => word.toString(16)).join(":");
  const [head = "", tail] = text.split("::");
  const groups = (part: string) => (part ? part.split(":").map((group) => Number.parseInt(group, 16)) : []);
  const left = groups(head);
  const right = tail === undefined ? [] : groups(tail);
  return [...left, ...Array<number>(Math.max(0, 8 - left.length - right.length)).fill(0), ...right];
}

function within(address: number[], [base, bits]: Range) {
  const prefix = words(base);
  for (let index = 0; bits > 0; index++, bits -= 16) {
    const mask = bits >= 16 ? 0xffff : (0xffff << (16 - bits)) & 0xffff;
    if (((address[index] ?? 0) & mask) !== ((prefix[index] ?? 0) & mask)) return false;
  }
  return true;
}

// Whether a server-side request to this address could only reach the public
// internet, never the host itself or a private network. Takes an address as
// a URL's hostname gives it, without brackets.
export function isPublicAddress(ip: string) {
  const version = isIP(ip);
  if (version === 0) return false;
  const address = words(ip);
  if (version === 4) return !BLOCKED_V4.some((range) => within(address, range));
  return within(address, GLOBAL_V6) && !BLOCKED_V6.some((range) => within(address, range));
}
