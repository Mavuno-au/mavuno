import { z } from "zod";

const MAX_LENGTH = 300;

// The first line of an error, with anything that could point at a person
// taken out: addresses, ids, long numbers and tokens. Error messages quote
// values, and the record must hold nothing about anyone.
export function errorSummary(message: string) {
  const line = message.split(/\r?\n/).find((part) => part.trim() !== "") ?? "";
  return (
    line
      .replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, "[email]")
      .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "[id]")
      .replace(/\bBearer\s+\S+/g, "[token]")
      .replace(/\b(?:token|key|secret|password)=\S+/gi, "[token]")
      .replace(/\b\d[\d\s-]{5,}\d\b/g, "[number]")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, MAX_LENGTH) || "Error"
  );
}

export function errorDigest(error: unknown) {
  return typeof error === "object" && error !== null && "digest" in error && typeof error.digest === "string" ? error.digest : null;
}

// zod prints its issues as JSON, whose first line is "[", so a failed parse
// would show on Health as just that. Paths and codes say what didn't match.
export function errorMessage(error: unknown) {
  if (error instanceof z.ZodError) {
    return `Unexpected data: ${error.issues
      .slice(0, 3)
      .map((issue) => `${issue.path.join(".") || "row"} ${issue.code}`)
      .join("; ")}`;
  }
  return error instanceof Error ? error.message : String(error);
}
