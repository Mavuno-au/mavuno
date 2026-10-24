import { z } from "zod";

// Trimmed first: autocorrect and pasting leave spaces the address check would refuse.
export const emailSchema = z.string().trim().toLowerCase().pipe(z.email("Enter a valid email address."));

// Postgres text can't hold a NUL character, and a request carrying one (pasted
// from a PDF or a terminal) is refused whole, with nothing to say why. So the
// text people write drops it where it is parsed.
export const withoutNul = (value: string) => value.replace(/\0/g, "");

export const passwordSchema = z.string().min(8, "Use at least 8 characters.").max(72, "Use at most 72 characters.");

export const signInSchema = z.object({ email: emailSchema, password: z.string().min(1, "Enter your password.") });

// What a failed password sign-in tells the person, from Supabase Auth's error code.
export const signInError = (code: string | undefined) =>
  code === "email_not_confirmed"
    ? "Confirm your email first. Check your inbox for the link."
    : code === "over_request_rate_limit"
      ? "Too many sign-in attempts right now. Wait a few minutes and try again."
      : "That email and password don't match.";

export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9_]{3,30}$/, "Usernames use 3 to 30 letters, numbers or underscores, like jean_paul.");

const EMAIL_PROVIDERS = /(gmail|googlemail|yahoo|hotmail|outlook|icloud|bigpond|optusnet|protonmail)/;

// Usernames are public, so one that names an email provider or the person's
// own email domain would give their address away. Mirrors
// public.username_reveals_email in the database.
export function revealsEmail(username: string, email: string) {
  const name = username.toLowerCase().replace(/_/g, "");
  const domain = (email.split("@")[1] ?? "").split(".")[0]?.toLowerCase() ?? "";
  return EMAIL_PROVIDERS.test(name) || (domain.length >= 4 && name.includes(domain));
}

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
