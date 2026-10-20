import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Toaster } from "sonner";
import { Analytics } from "@/components/shell/analytics";
import { publicEnv } from "@/lib/env";
import { THEME_SCRIPT } from "@/lib/theme";
import "./globals.css";

const sans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const mono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  metadataBase: new URL(publicEnv.siteUrl),
  title: { default: "Mavuno", template: "%s · Mavuno" },
  description: "The social network for African Australians. Follow people and organisations, join your city's space, find events and opportunities.",
  applicationName: "Mavuno",
  openGraph: { siteName: "Mavuno", type: "website", locale: "en_AU" },
  twitter: { card: "summary_large_image" },
  robots: { "max-image-preview": "large" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f4ef" },
    { media: "(prefers-color-scheme: dark)", color: "#121110" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en-AU" suppressHydrationWarning className={`${sans.variable} ${mono.variable} antialiased`}>
      <head>
        {/* Applies a saved dark theme before first paint so it never flashes light. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-dvh">
        {children}
        <Analytics siteId={publicEnv.fathomSiteId} />
        <Toaster position="bottom-center" offset={{ bottom: 88 }} mobileOffset={{ bottom: 88 }} toastOptions={{ className: "!bg-popover !text-ink !border-hairline" }} />
      </body>
    </html>
  );
}
