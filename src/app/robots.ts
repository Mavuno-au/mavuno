import type { MetadataRoute } from "next";
import { generateSitemaps } from "@/app/sitemap";
import { publicEnv } from "@/lib/env";

export const revalidate = 3600;

// Only pages a guest can never see are blocked here. Pages a crawler should
// visit but not list (sign-in, search, closed opportunities) carry a noindex
// tag instead, which a blocked crawler could never read.
export default async function robots(): Promise<MetadataRoute.Robots> {
  const url = (path: string) => new URL(path, publicEnv.siteUrl).href;
  const files = await generateSitemaps();
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/messages", "/notifications", "/saved", "/scheduled", "/settings", "/moderation", "/operations", "/onboarding", "/auth/", "/api/"] },
    host: publicEnv.siteUrl,
    sitemap: [url("/sitemap.xml"), ...files.map(({ id }) => url(`/sitemap/${id}.xml`))],
  };
}
