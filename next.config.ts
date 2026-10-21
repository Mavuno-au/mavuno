import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The dev-only badge sat on top of the navigation in every corner; build
  // errors still show as an overlay without it.
  devIndicators: false,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "2mb",
    },
  },
  async rewrites() {
    // Profiles live at /@username; the route itself is /u/[username].
    return [
      { source: "/@:username", destination: "/u/:username" },
      { source: "/@:username/:path*", destination: "/u/:username/:path*" },
      // The sitemap is split into files under /sitemap/; the index lives at
      // the address crawlers and Search Console already know.
      { source: "/sitemap.xml", destination: "/sitemap/index.xml" },
    ];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
          // Not a script policy (the theme script runs inline before paint); this
          // stops framing, <base> hijacking and plugins.
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'; base-uri 'self'; object-src 'none'" },
        ],
      },
    ];
  },
};

export default nextConfig;
