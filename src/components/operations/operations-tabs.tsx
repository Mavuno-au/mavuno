"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { Tabs } from "@/components/ui/page";

const TABS = [
  { href: "/operations", label: "Metrics" },
  { href: "/operations/activity", label: "Activity" },
  { href: "/operations/health", label: "Health" },
] as const;

export function OperationsTabs() {
  const path = usePathname();
  // The chosen range follows from tab to tab.
  const range = useSearchParams().get("range");
  const query = range ? `?range=${encodeURIComponent(range)}` : "";
  return <Tabs tabs={TABS.map((tab) => ({ href: `${tab.href}${query}`, label: tab.label, active: path === tab.href }))} />;
}
