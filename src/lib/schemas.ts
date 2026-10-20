import { z } from "zod";

export const emailSchema = z.email("Enter a valid email address.").transform((value) => value.trim().toLowerCase());

export const passwordSchema = z.string().min(8, "Use at least 8 characters.").max(72, "Use at most 72 characters.");

export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9_]{3,30}$/, "3 to 30 letters, numbers or underscores.");

export const httpsUrl = z
  .string()
  .trim()
  .transform((value) => (value && !/^https?:\/\//i.test(value) ? `https://${value}` : value))
  .pipe(z.union([z.literal(""), z.url({ protocol: /^https$/, message: "Enter a full https:// link." })]))
  .transform((value) => value || null);

export function firstIssue(error: z.ZodError) {
  return error.issues[0]?.message ?? "Check the form and try again.";
}
