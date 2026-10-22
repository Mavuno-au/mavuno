import { tokenize } from "@/lib/text";

// Personal details people sometimes put in a public post by mistake. Finding
// one only asks the writer to check; it never stops a post.
export type PersonalInfoKind = "phone" | "email" | "bank" | "card" | "tfn" | "medicare";
export type PersonalInfo = { kind: PersonalInfoKind; text: string };

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g;
const BSB = /\bBSB\b\W{0,3}\d{3}[\s-]?\d{3}\b/gi;
// A BSB written 000-000 followed by an account number.
const BSB_AND_ACCOUNT = /\b\d{3}-\d{3}[\s,/]+\d{6,10}\b/g;
const ACCOUNT = /\b(?:acc(?:ount)?|a\/c)\.?(?:\s*(?:no\.?|number|#))?\W{0,3}\d{6,10}\b/gi;
const TFN_LABELLED = /\b(?:TFN|tax file(?: number)?)\W{0,3}(\d{3}[\s-]?\d{3}[\s-]?\d{2,3})\b/gi;
// A run of digits with the separators people type between them. Not straight
// after a letter, a decimal point or a dollar sign, so prices and codes stay out.
const NUMBER = /(?<![\w.$])\+?\(?\d[\d\s().-]{6,24}\d(?!\w)/g;

const digitsOf = (text: string) => text.replace(/\D/g, "");

function luhn(digits: string) {
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let digit = Number(digits[digits.length - 1 - i]);
    if (i % 2 === 1) digit = digit * 2 > 9 ? digit * 2 - 9 : digit * 2;
    sum += digit;
  }
  return sum % 10 === 0;
}

const weighted = (digits: string, weights: readonly number[]) => weights.reduce((sum, weight, i) => sum + weight * Number(digits[i]), 0);

// The Australian Taxation Office's check: 9-digit numbers, and older 8-digit ones.
function isTfn(digits: string) {
  if (digits.length === 9) return weighted(digits, [1, 4, 3, 7, 5, 8, 6, 9, 10]) % 11 === 0;
  if (digits.length === 8) return weighted(digits, [10, 7, 8, 4, 6, 3, 5, 1]) % 11 === 0;
  return false;
}

// Ten digits (eleven with the number of the person on the card), starting 2 to
// 6, with the ninth a check digit over the first eight.
function isMedicare(digits: string) {
  return /^[2-6]\d{9,10}$/.test(digits) && weighted(digits, [1, 3, 7, 9, 1, 3, 7, 9]) % 10 === Number(digits[8]);
}

// Mobiles and landlines, written locally or with +61. 13, 1300 and 1800
// numbers belong to businesses and are left alone.
function isPhone(text: string, digits: string) {
  const local = text.trimStart().startsWith("+") ? (digits.startsWith("61") ? `0${digits.slice(2).replace(/^0/, "")}` : "") : digits;
  return /^0[23478]\d{8}$/.test(local);
}

function classify(text: string): PersonalInfoKind | null {
  const digits = digitsOf(text);
  if (isPhone(text, digits)) return "phone";
  if (digits.length >= 13 && digits.length <= 19 && luhn(digits)) return "card";
  if (isMedicare(digits)) return "medicare";
  if (digits.length === 9 && isTfn(digits)) return "tfn";
  return null;
}

export function findPersonalInfo(body: string): PersonalInfo[] {
  // Links can carry long numbers and @ signs that are nobody's details.
  const text = tokenize(body)
    .map((segment) => (segment.kind === "url" ? " ".repeat(segment.text.length) : segment.text))
    .join("");
  const found: (PersonalInfo & { at: number })[] = [];
  const add = (kind: PersonalInfoKind, match: RegExpMatchArray) => found.push({ kind, text: match[0].trim(), at: match.index ?? 0 });

  for (const match of text.matchAll(EMAIL)) add("email", match);
  for (const pattern of [BSB, BSB_AND_ACCOUNT, ACCOUNT]) for (const match of text.matchAll(pattern)) add("bank", match);
  for (const match of text.matchAll(TFN_LABELLED)) if (isTfn(digitsOf(match[1] ?? ""))) add("tfn", match);
  for (const match of text.matchAll(NUMBER)) {
    const kind = classify(match[0]);
    if (kind && !found.some((item) => item.text.includes(match[0].trim()))) add(kind, match);
  }
  // Sorted as a copy rather than with toSorted, which the app's JavaScript engine lacks.
  return [...found].sort((a, b) => a.at - b.at).map(({ kind, text: shown }) => ({ kind, text: shown }));
}

const NAMES: Record<PersonalInfoKind, string> = {
  phone: "phone number",
  email: "email address",
  bank: "bank details",
  card: "card number",
  tfn: "tax file number",
  medicare: "Medicare number",
};

// "Anyone can see this. Remove your phone number and email address?"
export function personalInfoWarning(found: readonly PersonalInfo[]) {
  const names = [...new Set(found.map((item) => NAMES[item.kind]))];
  const last = names.pop();
  const list = names.length > 0 ? `${names.join(", ")} and ${last}` : last;
  return `Anyone can see this. Remove your ${list}?`;
}
