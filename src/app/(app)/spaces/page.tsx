import type { Metadata } from "next";
import { permanentRedirect } from "next/navigation";
import { SPACE_TABS, SpacesView } from "./spaces-view";

export const metadata: Metadata = { title: "Spaces" };

export default async function SpacesPage({ searchParams }: PageProps<"/spaces">) {
  // Links from before tabs had their own addresses.
  const { tab } = await searchParams;
  const moved = SPACE_TABS.find((item) => item.tab !== "city" && item.tab === tab);
  if (moved) permanentRedirect(moved.href);
  return <SpacesView tab="city" />;
}
