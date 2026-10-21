"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { useRules } from "@/components/shell/compose";
import { ageCheckPath, onboardingPath } from "@/lib/safe-redirect";
import type { Viewer } from "@/lib/viewer";

// Settings (to download or delete an account) and the legal pages stay
// reachable from every step.
const OPEN_PATHS = ["/settings", "/privacy", "/terms", "/rules"];

// Listings are created outside the composer, so the rules are asked for here.
const LISTING_PATHS = ["/events/new", "/opportunities/new"];

function destination(viewer: Viewer | null, path: string) {
  if (viewer === null || OPEN_PATHS.some((open) => path.startsWith(open))) return null;
  if (viewer.banned) return "/banned";
  switch (viewer.age.kind) {
    case "deactivated":
      return "/deactivated";
    case "unconfirmed":
      return ageCheckPath(path);
    case "confirmed":
      return viewer.onboarded ? null : onboardingPath(path);
    default: {
      const exhaustive: never = viewer.age;
      return exhaustive;
    }
  }
}

// Members confirm their age, then finish setting up, before using the app,
// and come back to the page they were on. Banned members only reach the
// pages that let them read the decision, export and delete.
export function OnboardingGate({ viewer }: { viewer: Viewer | null }) {
  const router = useRouter();
  const path = usePathname();
  const target = destination(viewer, path);
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
