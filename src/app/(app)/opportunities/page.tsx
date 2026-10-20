import type { Metadata } from "next";
import { Plus } from "lucide-react";
import { FilterBar, FilterSelect, FilterToggle } from "@/components/community/filters";
import { OpportunityRow } from "@/components/community/rows";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState, PageHeader, Tabs } from "@/components/ui/page";
import { OPPORTUNITY_TYPES } from "@/lib/catalogue";
import { loadOpportunities } from "@/lib/data/community";
import { loadCities } from "@/lib/data/shell";
import { opportunityTypeSchema, type OpportunityType } from "@/lib/domain";
import { getViewer } from "@/lib/viewer";
import { joinPath } from "@/lib/safe-redirect";

export const metadata: Metadata = { title: "Opportunities" };

const TYPES = Object.entries(OPPORTUNITY_TYPES).flatMap(([value, type]) => {
  const parsed = opportunityTypeSchema.safeParse(value);
  return parsed.success ? [{ value: parsed.data, label: type.plural }] : [];
});

export default async function OpportunitiesPage({ searchParams }: PageProps<"/opportunities">) {
  const [viewer, cities, query] = await Promise.all([getViewer(), loadCities(), searchParams]);
  const type = opportunityTypeSchema.safeParse(query.type).data ?? null;
  const city = cities.find((item) => item.slug === query.city) ?? null;
  const remote = query.remote === "1";
  const opportunities = await loadOpportunities({ type, cityId: city?.id ?? null, remote });

  const tabHref = (value: OpportunityType | null) => {
    const params = new URLSearchParams();
    if (value) params.set("type", value);
    if (city) params.set("city", city.slug);
    if (remote) params.set("remote", "1");
    const search = params.toString();
    return search ? `/opportunities?${search}` : "/opportunities";
  };
  const postHref = viewer ? "/opportunities/new" : joinPath("/opportunities/new");

  return (
    <>
      <PageHeader
        title="Opportunities"
        meta="Jobs, scholarships, grants and mentoring"
        actions={
          <ButtonLink href={postHref} size="sm">
            <Plus /> Post
          </ButtonLink>
        }
      >
        <Tabs tabs={[{ href: tabHref(null), label: "All", active: type === null }, ...TYPES.map((item) => ({ href: tabHref(item.value), label: item.label, active: item.value === type }))]} />
      </PageHeader>
      <FilterBar>
        <FilterSelect
          name="city"
          label="City"
          value={city?.slug ?? ""}
          options={[{ value: "", label: "All cities" }, ...cities.map((item) => ({ value: item.slug, label: `${item.name}, ${item.state}` }))]}
        />
        <FilterToggle name="remote" label="Remote only" on={remote} />
      </FilterBar>
      {opportunities.length === 0 ? (
        <EmptyState title="No open opportunities here" action={<ButtonLink href={postHref}>Post an opportunity</ButtonLink>}>
          Try another type or city. If you know of something, share it with the community.
        </EmptyState>
      ) : (
        opportunities.map((opportunity) => <OpportunityRow key={opportunity.id} opportunity={opportunity} />)
      )}
    </>
  );
}
