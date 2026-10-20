import type { Metadata } from "next";
import { SpacesView } from "../spaces-view";

export const metadata: Metadata = { title: "Interest spaces" };

export default function InterestsSpacesPage() {
  return <SpacesView tab="interest" />;
}
