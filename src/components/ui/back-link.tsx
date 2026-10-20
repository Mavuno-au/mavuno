"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

let pagesVisited = 0;

// Counts pages seen in this tab, so Back knows whether there is a Mavuno page to return to.
export function TrackNavigation() {
  const pathname = usePathname();
  const last = useRef<string | null>(null);
  useEffect(() => {
    if (last.current !== pathname) pagesVisited += 1;
    last.current = pathname;
  }, [pathname]);
  return null;
}

// Goes back to wherever the reader came from in Mavuno, keeping their place in
// that feed; opened directly, it goes to `fallback` instead.
export function BackLink({ fallback }: { fallback: string }) {
  const router = useRouter();
  return (
    <Link
      href={fallback}
      aria-label="Back"
      onClick={(event) => {
        if (event.metaKey || event.ctrlKey || pagesVisited < 2) return;
        event.preventDefault();
        router.back();
      }}
      className="-ml-2 rounded-md p-2 text-ink-muted hover:bg-wash hover:text-ink"
    >
      <ArrowLeft className="size-5" />
    </Link>
  );
}
