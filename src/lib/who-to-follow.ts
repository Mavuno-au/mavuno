import { z } from "zod";
import { DISPLAY_TIME_ZONE } from "@/lib/format";

// Kept in cookies rather than localStorage so the server can leave the block
// out, or show the right page of suggestions, without it jumping after load.
export const HIDDEN_COOKIE = "who_to_follow";
export const ROUND_COOKIE = "who_to_follow_round";
export const SUGGESTIONS_PER_PAGE = 3;

const YEAR = 60 * 60 * 24 * 365;

export const isHidden = (value: string | undefined) => value === "hidden";

// Suggestions change once a day, on the same clock as times on the site.
export function suggestionDay(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: DISPLAY_TIME_ZONE }).format(now);
}

const roundValue = z.string().regex(/^(\d{4}-\d{2}-\d{2})\.(\d{1,4})$/);

// A round is "<day>.<n>", so yesterday's refreshes start again from the first page.
export function parseRound(value: string | undefined, day: string) {
  const parsed = roundValue.safeParse(value);
  if (!parsed.success) return 0;
  const [saved, round] = parsed.data.split(".");
  return saved === day ? Number(round) : 0;
}

export function rememberRound(day: string, round: number) {
  document.cookie = `${ROUND_COOKIE}=${day}.${round}; path=/; max-age=${60 * 60 * 24}; samesite=lax`;
}

export function rememberHidden(hidden: boolean) {
  document.cookie = hidden ? `${HIDDEN_COOKIE}=hidden; path=/; max-age=${YEAR}; samesite=lax` : `${HIDDEN_COOKIE}=; path=/; max-age=0; samesite=lax`;
}

// A small seeded generator (cyrb53 hash into mulberry32), so a seed gives the same order every time.
function seededRandom(seed: string) {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < seed.length; i++) {
    const ch = seed.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  let state = (Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)) >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Sorting by a random key per item, which is fine at the sizes suggestions come in.
function shuffle<T>(items: readonly T[], random: () => number) {
  return items
    .map((item) => ({ item, key: random() }))
    .toSorted((a, b) => a.key - b.key)
    .map(({ item }) => item);
}

// Splits the day's candidates into pages that each mix the network (best first)
// with shuffled popular people, a different split per page. Either side fills
// in when the other runs short, and the last page is topped up from the first
// so a refresh never shows fewer people.
export function suggestionPages<T>(network: readonly T[], popular: readonly T[], limit: number, seed: string): T[][] {
  const random = seededRandom(seed);
  let restNetwork = [...network];
  let restPopular = shuffle(popular, random);
  const pages: T[][] = [];

  do {
    const networkSlots = limit - (1 + Math.floor(random() * Math.max(1, limit - 1)));
    const pageNetwork = restNetwork.slice(0, Math.max(networkSlots, limit - restPopular.length));
    const pagePopular = restPopular.slice(0, limit - pageNetwork.length);
    restNetwork = restNetwork.slice(pageNetwork.length);
    restPopular = restPopular.slice(pagePopular.length);
    pages.push(shuffle([...pageNetwork, ...pagePopular], random));
  } while (restNetwork.length > 0 || restPopular.length > 0);

  const [first, ...rest] = pages;
  const last = rest.at(-1);
  if (first && last && last.length < limit) {
    rest[rest.length - 1] = shuffle([...last, ...first.slice(0, limit - last.length)], random);
  }
  return first ? [first, ...rest] : pages;
}

// Who fills the gap when someone on the page is dismissed: people from the
// pages after this one, nearest first, never anyone already on the page.
export function spareSuggestions<T extends { id: string }>(pages: readonly (readonly T[])[], round: number, limit: number): T[] {
  if (pages.length < 2) return [];
  const current = round % pages.length;
  const shown = new Set(pages[current]?.map((person) => person.id));
  const spares: T[] = [];
  for (let step = 1; step < pages.length && spares.length < limit; step++) {
    for (const person of pages[(current + step) % pages.length] ?? []) {
      if (shown.has(person.id)) continue;
      shown.add(person.id);
      spares.push(person);
      if (spares.length === limit) break;
    }
  }
  return spares;
}
