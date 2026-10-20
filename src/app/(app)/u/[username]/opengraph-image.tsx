import { loadProfile } from "@/lib/data/profiles";
import { compact } from "@/lib/format";
import { CardAvatar, cardImage, clip, Frame, identity, INK, OG_CONTENT_TYPE, OG_SIZE, render, SiteCard } from "@/lib/og";

export const alt = "A profile on Mavuno";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

const plural = (value: number, one: string, many: string) => `${compact(value)} ${value === 1 ? one : many}`;

export default async function Image({ params }: { params: Promise<{ username: string }> }) {
  const page = await loadProfile((await params).username, null);
  if (page.kind !== "profile") return render(<SiteCard />);
  const { profile } = page;
  const avatar = await cardImage(profile.avatar_url, 168);
  const about = profile.headline || profile.bio;
  const place = profile.city ? `${profile.city.name}, ${profile.city.state}` : null;

  return render(
    <Frame
      accent={identity(profile.colour)}
      note={[plural(profile.posts_count, "post", "posts"), plural(profile.followers_count, "follower", "followers"), `${compact(profile.following_count)} following`].join(" · ")}
    >
      <div style={{ display: "flex", flex: 1, alignItems: "center", gap: 52 }}>
        <CardAvatar src={avatar} name={profile.display_name} colour={profile.colour} size={168} organisation={profile.account_type === "organisation"} />
        <div style={{ display: "flex", flexDirection: "column", flex: 1, gap: 10 }}>
          <span style={{ fontSize: 66, fontWeight: 700, letterSpacing: -1.6, lineHeight: 1.05 }}>{clip(profile.display_name, 26)}</span>
          <span style={{ fontFamily: "Geist Mono", fontSize: 30, color: INK.muted }}>@{profile.username}</span>
          {about ? <span style={{ fontSize: 32, lineHeight: 1.35, marginTop: 16 }}>{clip(about, 130)}</span> : null}
          {place ? <span style={{ fontSize: 26, color: INK.muted, marginTop: 6 }}>{place}</span> : null}
        </div>
      </div>
    </Frame>,
  );
}
