"use client";

import { createContext, use, type ReactNode } from "react";
import type { Viewer } from "@/lib/viewer";

const ViewerContext = createContext<Viewer | null>(null);

export function ViewerProvider({ viewer, children }: { viewer: Viewer | null; children: ReactNode }) {
  return <ViewerContext value={viewer}>{children}</ViewerContext>;
}

export function useViewer() {
  return use(ViewerContext);
}

// Profiles the viewer can act as: themselves and the organisations they help run.
export function useActsAs(profileId: string | null) {
  const viewer = useViewer();
  if (!viewer || !profileId) return false;
  return viewer.id === profileId || viewer.organisations.some((org) => org.id === profileId);
}
