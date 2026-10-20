"use client";

import Script from "next/script";
import { useEffect } from "react";

// Fathom counts page views without cookies. Events carry a name and nothing
// about the person; see PRODUCT_METRICS.md for what each one answers.
type AnalyticsEvent = "guest-visit" | "signup";

declare global {
  interface Window {
    fathom?: { trackEvent: (name: string) => void };
  }
}

// Events sent before the script has loaded wait here.
const pending: AnalyticsEvent[] = [];

export function trackEvent(name: AnalyticsEvent) {
  if (window.fathom) window.fathom.trackEvent(name);
  else pending.push(name);
}

export function Analytics({ siteId }: { siteId: string | undefined }) {
  if (!siteId) return null;
  return (
    <Script
      src="https://cdn.usefathom.com/script.js"
      data-site={siteId}
      data-spa="auto"
      strategy="afterInteractive"
      onLoad={() => {
        for (const name of pending.splice(0)) window.fathom?.trackEvent(name);
      }}
    />
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
