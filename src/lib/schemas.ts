import { z } from "zod";

export const emailSchema = z.email("Enter a valid email address.").transform((value) => value.trim().toLowerCase());

export const passwordSchema = z.string().min(8, "Use at least 8 characters.").max(72, "Use at most 72 characters.");

export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9_]{3,30}$/, "Usernames use 3 to 30 letters, numbers or underscores, like jean_paul.");

// What someone types for a username, as close as it can be to a valid one:
// accents dropped, spaces, dots and dashes turned into underscores, anything
// else removed. "Jean-Paul N'Diaye" becomes "jean_paul_ndiaye".
export function toUsername(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[\s.\-]+/g, "_")
    .replace(/[^a-z0-9_]/g, "")
    .replace(/_{2,}/g, "_")
    .replace(/^_+/, "")
    .slice(0, 30);
}

export const httpsUrl = z
  .string()
  .trim()
  .transform((value) => (value && !/^https?:\/\//i.test(value) ? `https://${value}` : value))
  .pipe(z.union([z.literal(""), z.url({ protocol: /^https$/, message: "Enter a full https:// link." })]))
  .transform((value) => value || null);

export function firstIssue(error: z.ZodError) {
  return error.issues[0]?.message ?? "Check the form and try again.";
}
