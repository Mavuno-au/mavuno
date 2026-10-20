import type { MetadataRoute } from "next";
import { publicEnv } from "@/lib/env";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/messages", "/notifications", "/saved", "/scheduled", "/settings", "/moderation", "/onboarding", "/api/"] },
    host: publicEnv.siteUrl,
    sitemap: new URL("/sitemap.xml", publicEnv.siteUrl).href,
  };
}
