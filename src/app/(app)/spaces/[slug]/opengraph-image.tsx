import { loadSpace } from "@/lib/data/community";
import { compact } from "@/lib/format";
import { cardImage, clip, Frame, INK, OG_CONTENT_TYPE, OG_SIZE, PhotoBackdrop, render, SITE_HOST, SiteCard, Wordmark } from "@/lib/og";

export const alt = "A space on Mavuno";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const found = await loadSpace((await params).slug, null);
  if (!found) return render(<SiteCard />);
  const { space } = found;
  const members = space.members === 0 ? SITE_HOST : `${compact(space.members)} ${space.members === 1 ? "member" : "members"}`;
  const kind = space.kind === "city" ? "City space" : "Interest space";
  const photo = await cardImage(space.photo?.url ?? null, OG_SIZE.width / 2, OG_SIZE.height / 2);

  if (photo) {
    return render(
      <div style={{ display: "flex", position: "relative", width: "100%", height: "100%", fontFamily: "Geist", color: "#ffffff" }}>
        <PhotoBackdrop src={photo} />
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", position: "relative", width: "100%", padding: "64px 72px 52px" }}>
          <span style={{ fontFamily: "Geist Mono", fontSize: 26, opacity: 0.85 }}>{kind.toUpperCase()}</span>
          <div style={{ display: "flex", flexDirection: "column", gap: 18, maxWidth: 820 }}>
            <span style={{ fontSize: 92, fontWeight: 700, letterSpacing: -2.4, lineHeight: 1 }}>{clip(space.name, 28)}</span>
            {space.description ? <span style={{ fontSize: 32, lineHeight: 1.35, opacity: 0.92 }}>{clip(space.description, 120)}</span> : null}
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <Wordmark onPhoto />
            <span style={{ fontFamily: "Geist Mono", fontSize: 24, opacity: 0.85 }}>{members}</span>
          </div>
        </div>
      </div>,
    );
  }

  return render(
    <Frame accent={INK.seed} note={members}>
      <div style={{ display: "flex", flex: 1, flexDirection: "column", justifyContent: "center", gap: 18 }}>
        <span style={{ fontFamily: "Geist Mono", fontSize: 26, color: INK.muted }}>{kind.toUpperCase()}</span>
        <span style={{ fontSize: 88, fontWeight: 700, letterSpacing: -2.2, lineHeight: 1.02 }}>
          {space.emoji ? `${space.emoji} ` : ""}
          {clip(space.name, 28)}
        </span>
        {space.description ? <span style={{ fontSize: 32, lineHeight: 1.35, color: INK.muted }}>{clip(space.description, 140)}</span> : null}
      </div>
    </Frame>,
  );
}
