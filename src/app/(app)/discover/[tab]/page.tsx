import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DISCOVER_TABS, DiscoverView, isDiscoverTab } from "../discover-view";

export const dynamicParams = false;

export function generateStaticParams() {
  return DISCOVER_TABS.filter((tab) => tab.key !== "overview").map((tab) => ({ tab: tab.key }));
}

export async function generateMetadata({ params }: PageProps<"/discover/[tab]">): Promise<Metadata> {
  const { tab } = await params;
  const match = DISCOVER_TABS.find((item) => item.key === tab);
  return { title: match ? `${match.label} · Discover` : "Discover" };
}

export default async function DiscoverTabPage({ params }: PageProps<"/discover/[tab]">) {
  const { tab } = await params;
  if (!isDiscoverTab(tab) || tab === "overview") notFound();
  return <DiscoverView tab={tab} />;
}
