import type { Metadata } from "next";
import { permanentRedirect } from "next/navigation";
import { DISCOVER_TABS, DiscoverView } from "./discover-view";

export const metadata: Metadata = { title: "Discover" };

export default async function DiscoverPage({ searchParams }: PageProps<"/discover">) {
  // Links from before tabs had their own addresses.
  const { tab: requested } = await searchParams;
  const moved = DISCOVER_TABS.find((tab) => tab.key !== "overview" && tab.key === requested);
  if (moved) permanentRedirect(moved.href);
  return <DiscoverView tab="overview" />;
}
