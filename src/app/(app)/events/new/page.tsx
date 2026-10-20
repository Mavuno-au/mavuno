import type { Metadata } from "next";
import { EventForm } from "@/components/community/event-form";
import { PageHeader } from "@/components/ui/page";
import { loadSpaces } from "@/lib/data/community";
import { loadCities } from "@/lib/data/shell";
import { requireViewer } from "@/lib/viewer";

export const metadata: Metadata = { title: "Host an event" };

export default async function NewEventPage() {
  const viewer = await requireViewer("/events/new");
  const [cities, spaces] = await Promise.all([loadCities(), loadSpaces("joined", viewer)]);
  return (
    <>
      <PageHeader title="Host an event" back="/events" />
      <EventForm target={{ kind: "create" }} cities={cities} spaces={spaces.map(({ id, name, emoji }) => ({ id, name, emoji }))} />
    </>
  );
}
