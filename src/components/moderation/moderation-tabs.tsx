"use client";

import { usePathname } from "next/navigation";
import { Tabs } from "@/components/ui/page";

export function ModerationTabs({ admin }: { admin: boolean }) {
  const path = usePathname();
  const tabs = [
    { href: "/moderation", label: "Review" },
    { href: "/moderation/reports", label: "Reports" },
    { href: "/moderation/people", label: "People" },
    { href: "/moderation/age", label: "Age checks" },
    ...(admin ? [{ href: "/moderation/admin", label: "Admin" }] : []),
  ];
  return <Tabs tabs={tabs.map((tab) => ({ ...tab, active: path === tab.href }))} />;
}
