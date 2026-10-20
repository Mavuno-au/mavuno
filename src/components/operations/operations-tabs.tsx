"use client";

import { usePathname } from "next/navigation";
import { Tabs } from "@/components/ui/page";

const TABS = [
  { href: "/operations", label: "Metrics" },
  { href: "/operations/health", label: "Health" },
] as const;

export function OperationsTabs() {
  const path = usePathname();
  return <Tabs tabs={TABS.map((tab) => ({ ...tab, active: path === tab.href }))} />;
}
