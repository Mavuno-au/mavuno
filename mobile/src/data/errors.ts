// Why a request failed, as far as the reader needs to know: their connection,
// or Mavuno. Each gets its own sentence under "Try again".
export type Reason = "offline" | "server";

export class RequestError extends Error {
  reason: Reason;
  constructor(what: string, reason: Reason, message: string) {
    super(`${what} failed: ${message}`);
    this.name = "RequestError";
    this.reason = reason;
  }
}

// supabase-js answers a request that never reached the server with status 0,
// no code and the transport's own message, such as "TypeError: Network request failed".
const TRANSPORT = /network request failed|failed to fetch|fetch failed|networkerror|aborterror|timeouterror|internet connection|could not connect|software caused connection abort/i;

export function requestError(what: string, error: { message: string; code?: string | null }) {
  return new RequestError(what, !error.code && TRANSPORT.test(error.message) ? "offline" : "server", error.message);
}

export const reasonOf = (error: unknown): Reason => (error instanceof RequestError ? error.reason : "server");

export const PROBLEM: Record<Reason, string> = {
  offline: "Check your connection, then try again.",
  server: "Mavuno is having trouble right now. Try again in a moment.",
};
