import type { Metadata } from "next";
import { SpaceForm } from "@/components/community/space-form";
import { PageHeader } from "@/components/ui/page";
import { loadCities } from "@/lib/data/shell";
import { requireViewer } from "@/lib/viewer";

export const metadata: Metadata = { title: "Start a space" };

export default async function NewSpacePage() {
  await requireViewer("/spaces/new");
  const cities = await loadCities();
  return (
    <>
      <PageHeader title="Start a space" back="/spaces" />
      <p className="border-b border-hairline px-4 py-4 text-[15px] text-ink-muted sm:px-6">
        Spaces gather people around a place or an interest. You'll look after it as its owner, and anyone can join. Check there isn't one already first.
      </p>
      <SpaceForm cities={cities} />
    </>
  );
}
