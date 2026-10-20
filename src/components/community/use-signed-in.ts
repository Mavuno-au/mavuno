"use client";

import { usePathname, useRouter } from "next/navigation";
import { useViewer } from "@/components/shell/viewer-context";
import { joinPath } from "@/lib/safe-redirect";

// Runs the action for members; sends guests to join and back here.
export function useSignedIn() {
  const viewer = useViewer();
  const router = useRouter();
  const path = usePathname();
  return (action: () => void) => (viewer ? action() : router.push(joinPath(path)));
}
