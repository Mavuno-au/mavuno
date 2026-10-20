import { serverEnv } from "@/lib/server-env";

// IndexNow checks that the key in a submission is served from our own site.
export function GET() {
  if (!serverEnv.INDEXNOW_KEY) return new Response("Not found", { status: 404 });
  return new Response(serverEnv.INDEXNOW_KEY, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
