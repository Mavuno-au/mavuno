import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { OpportunityForm } from "@/components/community/opportunity-form";
import { PageHeader } from "@/components/ui/page";
import { DEADLINE_ZONE, loadOpportunity, toZonedInput } from "@/lib/data/community";
import { loadCities } from "@/lib/data/shell";
import { requireViewer } from "@/lib/viewer";

export const metadata: Metadata = { title: "Edit opportunity" };

export default async function EditOpportunityPage({ params }: PageProps<"/opportunities/[id]/edit">) {
  const { id } = await params;
  const viewer = await requireViewer(`/opportunities/${id}/edit`);
  const [found, cities] = await Promise.all([loadOpportunity(id, viewer), loadCities()]);
  const opportunity = found?.opportunity;
  if (!opportunity || !(opportunity.posterId === viewer.id || viewer.organisations.some((org) => org.id === opportunity.posterId))) notFound();

  const draft = {
    type: opportunity.type,
    title: opportunity.title,
    organisation: opportunity.organisation ?? "",
    description: opportunity.description,
    cityId: opportunity.cityId,
    remote: opportunity.remote,
    location: opportunity.location ?? "",
    applyUrl: opportunity.applyUrl ?? "",
    applyEmail: opportunity.applyEmail ?? "",
    deadline: opportunity.deadlineAt ? toZonedInput(opportunity.deadlineAt, DEADLINE_ZONE).slice(0, 10) : "",
    compensation: opportunity.compensation ?? "",
  };

  return (
    <>
      <PageHeader title="Edit opportunity" back={`/opportunities/${opportunity.id}`} meta={opportunity.title} />
      <OpportunityForm target={{ kind: "edit", opportunityId: opportunity.id, draft }} cities={cities} />
    </>
  );
}
