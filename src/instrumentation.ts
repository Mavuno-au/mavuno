import type { Instrumentation } from "next";

// Every error the server catches while rendering, in a route handler or in
// a server action is counted in server_errors (see src/lib/server-errors.ts).
export const onRequestError: Instrumentation.onRequestError = async (error, _request, context) => {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { recordServerError } = await import("./lib/server-errors");
  await recordServerError(error, context);
};
