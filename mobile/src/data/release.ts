import Constants from "expo-constants";
import { useCallback, useEffect, useState } from "react";
import { Platform } from "react-native";
import { z } from "zod";
import { appReleaseSchema, type AppRelease } from "@/lib/app-release";
import { siteLink } from "@/data/env";
import { useSignificantReturn } from "@/util/app-state";

// This build's number as the App Store knows it. Android builds have none
// yet, so they are never stopped.
const BUILD = z.coerce.number().int().safeParse(Platform.OS === "ios" ? Constants.expoConfig?.ios?.buildNumber : undefined).data ?? null;

// The release this build is too old for, if it is. Asked when the app opens
// and when it comes back after a while, never on a timer. When the check
// can't be made the app carries on: being offline shouldn't lock anyone out.
export function useRequiredUpdate(): AppRelease | null {
  const [release, setRelease] = useState<AppRelease | null>(null);
  const check = useCallback(() => {
    if (BUILD === null) return;
    void fetch(siteLink("/api/app-release"))
      .then((response) => response.json())
      .then((body: unknown) => {
        const parsed = appReleaseSchema.safeParse(body).data;
        if (parsed) setRelease(parsed);
      })
      .catch(() => undefined);
  }, []);
  useEffect(check, [check]);
  useSignificantReturn(check);
  return release !== null && BUILD !== null && BUILD < release.minimumBuild ? release : null;
}
