"use client";

import { usePathname } from "next/navigation";
import Script from "next/script";
import { useEffect, useRef } from "react";

// Visit counts from Fathom (no cookies) and Google Analytics, each only when
// its ID is set. Events carry a name and nothing about the person; see
// PRODUCT_METRICS.md for what each one answers.
type AnalyticsEvent = "guest-visit" | "signup";

declare global {
  interface Window {
    fathom?: { trackEvent: (name: string) => void };
    gtag?: (...args: unknown[]) => void;
  }
}

// Events sent before a script has loaded wait here, one queue per service.
const pending: Record<"fathom" | "google", AnalyticsEvent[]> = { fathom: [], google: [] };

const sendToGoogle = (name: AnalyticsEvent) => window.gtag?.("event", name);

export function trackEvent(name: AnalyticsEvent) {
  if (window.fathom) window.fathom.trackEvent(name);
  else pending.fathom.push(name);
  if (window.gtag) sendToGoogle(name);
  else pending.google.push(name);
}

// Google's advertising features stay off: no ad storage, no personalisation,
// no Google Signals, so visits are counted but never linked to ads or to
// people's Google accounts, as the privacy policy says.
const googleSetup = (id: string) => `
window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
window.gtag = gtag;
gtag('consent', 'default', { ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied', analytics_storage: 'granted' });
gtag('js', new Date());
gtag('config', ${JSON.stringify(id)}, { allow_google_signals: false, allow_ad_personalization_signals: false, send_page_view: false });
gtag('event', 'page_view', { page_location: location.origin + location.pathname, page_path: location.pathname });
`;

// Page views go without the query string: a search for a person's name, or
// which organisation's notifications were open, isn't Google's to keep. In the
// property, turn off enhanced measurement's history page views and site search
// too, or Google reads the full address itself.
// The setup script sends the first; this sends the ones after it.
function PageViews() {
  const path = usePathname();
  const first = useRef(path);
  useEffect(() => {
    if (path === first.current) return;
    first.current = "";
    window.gtag?.("event", "page_view", { page_location: `${window.location.origin}${path}`, page_path: path });
  }, [path]);
  return null;
}

export function Analytics({ fathomSiteId, googleAnalyticsId }: { fathomSiteId: string | undefined; googleAnalyticsId: string | undefined }) {
  return (
    <>
      {fathomSiteId ? (
        <Script
          src="https://cdn.usefathom.com/script.js"
          data-site={fathomSiteId}
          data-spa="auto"
          strategy="afterInteractive"
          onLoad={() => {
            for (const name of pending.fathom.splice(0)) window.fathom?.trackEvent(name);
          }}
        />
      ) : null}
      {googleAnalyticsId ? (
        <>
          <Script id="google-analytics" strategy="afterInteractive">
            {googleSetup(googleAnalyticsId)}
          </Script>
          <Script
            src={`https://www.googletagmanager.com/gtag/js?id=${googleAnalyticsId}`}
            strategy="afterInteractive"
            onLoad={() => {
              for (const name of pending.google.splice(0)) sendToGoogle(name);
            }}
          />
          <PageViews />
        </>
      ) : null}
    </>
  );
}

const GUEST_VISIT_KEY = "mavuno:guest-visit";

// Once per browser session for someone who is not signed in.
export function TrackGuestVisit() {
  useEffect(() => {
    try {
      if (sessionStorage.getItem(GUEST_VISIT_KEY)) return;
      sessionStorage.setItem(GUEST_VISIT_KEY, "1");
    } catch {
      return;
    }
    trackEvent("guest-visit");
  }, []);
  return null;
}
