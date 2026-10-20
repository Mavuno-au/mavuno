export type Result<T = undefined> = { ok: true; data: T } | { ok: false; error: string };

export const ok = <T>(data: T): Result<T> => ({ ok: true, data });
export const done: Result = { ok: true, data: undefined };
export const fail = (error: string): Result<never> => ({ ok: false, error });

const FRIENDLY_CODES = new Set(["P0001", "P0002", "42501", "23514", "23505"]);

// Database functions raise sentences meant for people; constraint violations
// and anything else are not shown as they are.
export function friendlyError(error: { code?: string; message: string } | null) {
  if (error?.code === "23505" && /duplicate key/.test(error.message)) return "That is already taken.";
  if (error?.code && FRIENDLY_CODES.has(error.code) && !/violates|constraint|permission denied|relation/.test(error.message)) {
    return error.message;
  }
  if (error?.code === "42501") return "You can't do that.";
  return "Something went wrong. Try again.";
}

export const failFrom = (error: { code?: string; message: string } | null): Result<never> => fail(friendlyError(error));
