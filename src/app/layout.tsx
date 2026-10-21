import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Suspense } from "react";
import { Toaster } from "sonner";
import { Analytics } from "@/components/shell/analytics";
import { KeyboardWatcher } from "@/components/shell/keyboard-watcher";
import { ProgressBar } from "@/components/shell/progress-bar";
import { ThemeScript } from "@/components/shell/theme-script";
import { UpdateNotice } from "@/components/shell/update-notice";
import { buildId } from "@/lib/build";
import { publicEnv } from "@/lib/env";
import { serverEnv } from "@/lib/server-env";
import "./globals.css";

const sans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const mono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  metadataBase: new URL(publicEnv.siteUrl),
  title: { default: "Mavuno", template: "%s · Mavuno" },
  description: "The social network for African Australians. Follow people and organisations, join your city's space, find events and opportunities.",
  applicationName: "Mavuno",
  appleWebApp: { capable: true, title: "Mavuno", statusBarStyle: "default" },
  openGraph: { siteName: "Mavuno", type: "website", locale: "en_AU" },
  twitter: { card: "summary_large_image" },
  robots: { "max-image-preview": "large" },
  verification: {
    google: serverEnv.GOOGLE_SITE_VERIFICATION,
    other: serverEnv.BING_SITE_VERIFICATION ? { "msvalidate.01": serverEnv.BING_SITE_VERIFICATION } : undefined,
  },
};

export const viewport: Viewport = {
  // Lets env(safe-area-inset-*) report the notch and home bar on iPhones.
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f4ef" },
    { media: "(prefers-color-scheme: dark)", color: "#121110" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en-AU" suppressHydrationWarning className={`${sans.variable} ${mono.variable} antialiased`}>
      <head>
        <ThemeScript />
      </head>
      <body className="min-h-dvh">
        <Suspense>
          <ProgressBar />
        </Suspense>
        {children}
        <UpdateNotice build={buildId} />
        <KeyboardWatcher />
        <Analytics fathomSiteId={publicEnv.fathomSiteId} googleAnalyticsId={publicEnv.googleAnalyticsId} />
        <Toaster position="bottom-center" offset={{ bottom: 24 }} mobileOffset={{ bottom: "calc(var(--mobile-nav-height) + 1rem)" }} toastOptions={{ className: "!bg-popover !text-ink !border-hairline" }} />
      </body>
    </html>
  );
}
