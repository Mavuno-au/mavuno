import type { Metadata } from "next";
import { BadgeCheck, ExternalLink, Mail, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ListingControls } from "@/components/community/listing-controls";
import { deadlineLabel, opportunityPlace, ReviewBanner } from "@/components/community/rows";
import { SaveOpportunity } from "@/components/community/save-opportunity";
import { RichText } from "@/components/post/rich-text";
import { Avatar } from "@/components/ui/avatar";
import { buttonClass } from "@/components/ui/button";
import { JsonLd } from "@/components/seo/json-ld";
import { Chip, PageHeader } from "@/components/ui/page";
import { OPPORTUNITY_TYPES } from "@/lib/catalogue";
import { loadOpportunity } from "@/lib/data/community";
import type { OpportunityType } from "@/lib/domain";
import { relativeTime } from "@/lib/format";
import { breadcrumbJsonLd } from "@/lib/structured-data";
import { getViewer } from "@/lib/viewer";

// How the title joins the organisation: "Marketing internship at Acme",
// "Research scholarship from the Smith Trust".
const JOINER: Record<OpportunityType, string> = { job: "at", internship: "at", volunteering: "at", mentoring: "with", scholarship: "from", grant: "from", business: "from" };

const excerpt = (text: string, max: number) => {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1).trimEnd()}…` : flat;
};

export async function generateMetadata({ params }: PageProps<"/opportunities/[id]">): Promise<Metadata> {
  const found = await loadOpportunity((await params).id, await getViewer());
  if (!found) return { title: "Opportunity" };
  const { opportunity } = found;
  const offeredBy = opportunity.organisation ?? opportunity.poster.displayName;
  const path = `/opportunities/${opportunity.id}`;
  const facts = [OPPORTUNITY_TYPES[opportunity.type].label, opportunityPlace(opportunity), opportunity.deadlineAt ? `apply by ${deadlineLabel(opportunity.deadlineAt)}` : null].filter(Boolean).join(" · ");
  return {
    title: opportunity.title.toLowerCase().includes(offeredBy.toLowerCase()) ? opportunity.title : `${opportunity.title} ${JOINER[opportunity.type]} ${offeredBy}`,
    description: `${facts}. ${excerpt(opportunity.description, Math.max(60, 160 - facts.length - 2))}`,
    alternates: { canonical: path },
    openGraph: { url: path },
    // A closed listing stays readable for anyone holding the link but leaves search results.
    robots: opportunity.closed || opportunity.review.kind !== "published" ? { index: false, follow: true } : undefined,
  };
}

export default async function OpportunityPage({ params }: PageProps<"/opportunities/[id]">) {
  const viewer = await getViewer();
  const found = await loadOpportunity((await params).id, viewer);
  if (!found) notFound();
  const { opportunity, saved } = found;
  const type = OPPORTUNITY_TYPES[opportunity.type];
  const details = [
    { label: "Offered by", value: opportunity.organisation },
    { label: "Where", value: opportunityPlace(opportunity) },
    { label: "Pay or value", value: opportunity.compensation },
    { label: "Deadline", value: opportunity.deadlineAt ? deadlineLabel(opportunity.deadlineAt) : "None given" },
  ];

  return (
    <>
      {opportunity.review.kind === "published" ? (
        <JsonLd data={breadcrumbJsonLd([{ name: "Opportunities", path: "/opportunities" }, { name: type.plural, path: `/opportunities?type=${opportunity.type}` }, { name: opportunity.title }])} />
      ) : null}
      <PageHeader title={type.label} back="/opportunities" meta={`Posted ${relativeTime(opportunity.createdAt)}`} />
      <ReviewBanner review={opportunity.review} what="opportunity" />
      {opportunity.closed ? (
        <p role="status" className="border-b border-hairline bg-wash px-4 py-3 text-sm font-medium sm:px-6">
          This opportunity has closed.
        </p>
      ) : null}

      <section className="grid gap-5 border-b border-hairline px-4 py-5 sm:px-6">
        <div>
          <Chip tone="primary">{type.label}</Chip>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight wrap-anywhere">{opportunity.title}</h2>
        </div>

        <Link href={`/@${opportunity.poster.username}`} className="-mx-2 flex items-center gap-3 rounded-lg p-2 hover:bg-wash">
          <Avatar person={opportunity.poster} />
          <span className="grid min-w-0">
            <span className="text-xs text-ink-muted">Posted by</span>
            <span className="flex min-w-0 items-center gap-1">
              <span className="truncate font-semibold">{opportunity.poster.displayName}</span>
              {opportunity.poster.verified ? <BadgeCheck className="size-4 shrink-0 text-primary" aria-label="Verified organisation" /> : null}
            </span>
            <span className="truncate font-mono text-xs text-ink-muted">@{opportunity.poster.username}</span>
          </span>
        </Link>

        <dl className="grid gap-2 text-[15px] sm:grid-cols-2">
          {details.flatMap((detail) =>
            detail.value
              ? [
                  <div key={detail.label}>
                    <dt className="text-xs text-ink-muted">{detail.label}</dt>
                    <dd>{detail.value}</dd>
                  </div>,
                ]
              : [],
          )}
        </dl>

        <div className="flex flex-wrap items-center gap-2">
          {!opportunity.closed && opportunity.applyUrl ? (
            <a href={opportunity.applyUrl} target="_blank" rel="noopener noreferrer nofollow" className={buttonClass()}>
              <ExternalLink /> Apply
            </a>
          ) : null}
          {!opportunity.closed && opportunity.applyEmail ? (
            <a href={`mailto:${opportunity.applyEmail}?subject=${encodeURIComponent(opportunity.title)}`} className={buttonClass({ variant: opportunity.applyUrl ? "outline" : "primary" })}>
              <Mail /> Apply by email
            </a>
          ) : null}
          <SaveOpportunity opportunityId={opportunity.id} saved={saved} />
        </div>
        <ListingControls kind="opportunity" id={opportunity.id} ownerId={opportunity.posterId} published={opportunity.review.kind === "published"} ended={opportunity.closed} />
      </section>

      <section aria-label="About this opportunity" className="border-b border-hairline px-4 py-5 sm:px-6">
        <RichText body={opportunity.description} className="text-[15px] leading-relaxed" />
      </section>

      <p className="flex gap-3 border-b border-hairline px-4 py-4 text-sm text-ink-muted sm:px-6">
        <ShieldCheck className="mt-0.5 size-4 shrink-0" />
        <span>Stay safe: never pay to apply, and don't share bank or ID details until you've checked who you're dealing with. If something seems off, report it.</span>
      </p>
    </>
  );
}
