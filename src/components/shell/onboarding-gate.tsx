"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { useRules } from "@/components/shell/compose";
import { setupPath } from "@/lib/setup-path";
import type { Viewer } from "@/lib/viewer";

// Listings are created outside the composer, so the rules are asked for here.
const LISTING_PATHS = ["/events/new", "/opportunities/new"];

// Signing in already goes straight to whatever setupPath owes (arrivalPath);
// this catches the rest, such as an old tab or a typed address.
export function OnboardingGate({ viewer }: { viewer: Viewer | null }) {
  const router = useRouter();
  const path = usePathname();
  const target = viewer === null ? null : setupPath(viewer, path);
  const { ensure } = useRules();
  const askRules = target === null && viewer !== null && !viewer.rulesAccepted && LISTING_PATHS.includes(path);
  useEffect(() => {
    if (target) router.replace(target);
  }, [target, router]);
  useEffect(() => {
    if (askRules) void ensure();
  }, [askRules, ensure]);
  return null;
}
