import { deadlineLabel, opportunityPlace } from "@/components/community/rows";
import { OPPORTUNITY_TYPES } from "@/lib/catalogue";
import { loadOpportunity } from "@/lib/data/community";
import { CardAvatar, cardImage, clip, Frame, INK, OG_CONTENT_TYPE, OG_SIZE, render, SiteCard } from "@/lib/og";

export const alt = "An opportunity on Mavuno";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const found = await loadOpportunity((await params).id, null);
  if (!found || found.opportunity.review.kind !== "published") return render(<SiteCard />);
  const { opportunity } = found;
  const { poster } = opportunity;
  const avatar = await cardImage(poster.avatarUrl, 56);
  const offeredBy = opportunity.organisation ?? poster.displayName;
  const note = opportunity.closed ? "Closed" : opportunity.deadlineAt ? `Apply by ${deadlineLabel(opportunity.deadlineAt)}` : "Open now";

  return render(
    <Frame accent={INK.seed} note={note}>
      <div style={{ display: "flex", flex: 1, flexDirection: "column", justifyContent: "center", gap: 16 }}>
        <span style={{ fontFamily: "Geist Mono", fontSize: 26, color: INK.leaf }}>{OPPORTUNITY_TYPES[opportunity.type].label.toUpperCase()}</span>
        <span style={{ fontSize: opportunity.title.length > 50 ? 54 : 66, fontWeight: 700, letterSpacing: -1.4, lineHeight: 1.08 }}>{clip(opportunity.title, 90)}</span>
        <span style={{ fontSize: 30, color: INK.muted }}>{clip(`${offeredBy} · ${opportunityPlace(opportunity)}`, 70)}</span>
        {opportunity.compensation ? <span style={{ fontSize: 28 }}>{clip(opportunity.compensation, 60)}</span> : null}
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 12 }}>
          <CardAvatar src={avatar} name={poster.displayName} colour={poster.colour} size={44} organisation={poster.accountType === "organisation"} />
          <span style={{ fontSize: 26 }}>Posted by {clip(poster.displayName, 40)}</span>
        </div>
      </div>
    </Frame>,
  );
}
