import type { Metadata } from "next";
import { SpacesView } from "../spaces-view";

export const metadata: Metadata = { title: "Your spaces" };

export default function JoinedSpacesPage() {
  return <SpacesView tab="joined" />;
}
