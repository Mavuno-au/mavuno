import { timingSafeEqual } from "node:crypto";

// For the routes schedulers call. Compared in constant time so the secret can't be guessed a character at a time.
export function sentSecret(authorization: string | null, secret: string) {
  const expected = Buffer.from(`Bearer ${secret}`);
  const given = Buffer.from(authorization ?? "");
  return given.length === expected.length && timingSafeEqual(given, expected);
}
