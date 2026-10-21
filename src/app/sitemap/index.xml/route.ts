import { generateSitemaps } from "@/app/sitemap";
import { publicEnv } from "@/lib/env";

export const revalidate = 3600;

// Next writes one file per sitemap id but no index, so this lists them. It is
// also what /sitemap.xml serves, through a rewrite in next.config.ts, since
// Next keeps that path for the metadata file itself.
export async function GET() {
  const files = await generateSitemaps();
  const body = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...files.map(({ id }) => `<sitemap><loc>${new URL(`/sitemap/${id}.xml`, publicEnv.siteUrl).href}</loc></sitemap>`),
    "</sitemapindex>",
  ].join("\n");
  return new Response(body, { headers: { "Content-Type": "application/xml" } });
}
