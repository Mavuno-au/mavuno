"use client";

import { useEffect } from "react";
import { checkForUpdate, setCurrentBuild } from "@/lib/version";

// A tab that was away for a while may have missed a deploy.
const AWAY_MS = 10 * 60_000;

export function UpdateNotice({ build }: { build: string | null }) {
  useEffect(() => {
    setCurrentBuild(build);
    let hiddenAt: number | null = null;
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        hiddenAt = Date.now();
        return;
      }
      if (hiddenAt !== null && Date.now() - hiddenAt > AWAY_MS) void checkForUpdate();
      hiddenAt = null;
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [build]);
  return null;
}
