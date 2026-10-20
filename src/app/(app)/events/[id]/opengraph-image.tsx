import { eventPlace, eventWhen } from "@/components/community/rows";
import { EVENT_CATEGORIES } from "@/lib/catalogue";
import { loadEvent } from "@/lib/data/community";
import { CardAvatar, cardImage, clip, Frame, INK, OG_CONTENT_TYPE, OG_SIZE, render, SiteCard } from "@/lib/og";

export const alt = "An event on Mavuno";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const found = await loadEvent((await params).id, null);
  if (!found || found.event.review.kind !== "published") return render(<SiteCard />);
  const { event } = found;
  const [cover, host] = await Promise.all([cardImage(event.coverUrl, 400), cardImage(event.host.avatarUrl, 56)]);
  const place = eventPlace(event);
  const going = event.going > 0 ? `${event.going} going` : EVENT_CATEGORIES[event.category];

  return render(
    <Frame accent={INK.seed} note={event.cancelled ? "Cancelled" : going}>
      <div style={{ display: "flex", flex: 1, gap: 44, alignItems: "center" }}>
        <div style={{ display: "flex", flexDirection: "column", flex: 1, gap: 16 }}>
          <span style={{ fontFamily: "Geist Mono", fontSize: 26, color: INK.leaf }}>{eventWhen(event)}</span>
          <span style={{ fontSize: event.title.length > 50 ? 54 : 66, fontWeight: 700, letterSpacing: -1.4, lineHeight: 1.08 }}>{clip(event.title, 90)}</span>
          {place ? <span style={{ fontSize: 30, color: INK.muted }}>{clip(place, 70)}</span> : null}
          <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 12 }}>
            <CardAvatar src={host} name={event.host.displayName} colour={event.host.colour} size={44} organisation={event.host.accountType === "organisation"} />
            <span style={{ fontSize: 26 }}>Hosted by {clip(event.host.displayName, 40)}</span>
          </div>
        </div>
        {cover ? <img src={cover} width={400} height={400} style={{ borderRadius: 28, objectFit: "cover" }} alt="" /> : null}
      </div>
    </Frame>,
  );
}
