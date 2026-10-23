import { NextResponse, type NextRequest } from "next/server";
import sitemap, { generateSitemaps } from "@/app/sitemap";
import { publicEnv } from "@/lib/env";
import { sentSecret } from "@/lib/cron-secret";
import { serverEnv } from "@/lib/server-env";

const DAY = 25 * 60 * 60 * 1000;
// IndexNow accepts up to 10,000 addresses a request.
const LIMIT = 10_000;

// Run daily by Vercel's cron (vercel.json): sends every page from the sitemap
// that changed in the last day to IndexNow, which shares it with Bing and others.
export async function GET(request: NextRequest) {
  const { INDEXNOW_KEY: key, CRON_SECRET: secret } = serverEnv;
  if (!key || !secret) return NextResponse.json({ error: "IndexNow is not configured" }, { status: 503 });
  if (!sentSecret(request.headers.get("authorization"), secret)) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const since = Date.now() - DAY;
  const files = await generateSitemaps();
  const entries = (await Promise.all(files.map(({ id }) => sitemap({ id: Promise.resolve(id) })))).flat();
  const changed = entries.flatMap((entry) => (entry.lastModified && new Date(entry.lastModified).getTime() > since ? [entry.url] : [])).slice(0, LIMIT);
  if (changed.length === 0) return NextResponse.json({ submitted: 0 });

  const site = new URL(publicEnv.siteUrl);
  const response = await fetch("https://api.indexnow.org/indexnow", {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({ host: site.host, key, keyLocation: new URL("/indexnow-key.txt", site).href, urlList: changed }),
    signal: AbortSignal.timeout(10_000),
  });
  return NextResponse.json({ submitted: changed.length, status: response.status }, { status: response.ok ? 200 : 502 });
}
