"use client";

import { usePathname } from "next/navigation";
import { Tabs } from "@/components/ui/page";

const TABS = [
  { href: "/settings", label: "Profile" },
  { href: "/settings/account", label: "Account" },
  { href: "/settings/privacy", label: "Privacy" },
  { href: "/settings/languages", label: "Languages" },
  { href: "/settings/appearance", label: "Appearance" },
  { href: "/settings/safety", label: "Safety" },
  { href: "/settings/organisations", label: "Organisations" },
] as const;

export function SettingsTabs() {
  const path = usePathname();
  return <Tabs tabs={TABS.map((tab) => ({ ...tab, active: tab.href === "/settings" ? path === tab.href : path.startsWith(tab.href) }))} />;
}
