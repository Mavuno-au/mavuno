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
