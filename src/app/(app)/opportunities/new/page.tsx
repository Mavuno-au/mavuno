import type { Metadata } from "next";
import { OpportunityForm } from "@/components/community/opportunity-form";
import { PageHeader } from "@/components/ui/page";
import { loadCities } from "@/lib/data/shell";
import { requireViewer } from "@/lib/viewer";

export const metadata: Metadata = { title: "Post an opportunity" };

export default async function NewOpportunityPage() {
  await requireViewer("/opportunities/new");
  const cities = await loadCities();
  return (
    <>
      <PageHeader title="Post an opportunity" back="/opportunities" />
      <p className="border-b border-hairline px-4 py-4 text-[15px] text-ink-muted sm:px-6">
        Share a job, internship, scholarship, grant, mentoring offer or business opportunity. Never ask people to pay to apply.
      </p>
      <OpportunityForm target={{ kind: "create" }} cities={cities} />
    </>
  );
}
