import { loadInviter } from "@/lib/data/profiles";
import { CardAvatar, cardImage, clip, Frame, identity, INK, OG_CONTENT_TYPE, OG_SIZE, render, SITE_HOST, SiteCard } from "@/lib/og";

export const alt = "An invitation to join Mavuno";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

// What a WhatsApp group sees under an invite link: who is asking, in their colour.
export default async function Image({ params }: { params: Promise<{ username: string }> }) {
  const inviter = await loadInviter((await params).username);
  if (!inviter) return render(<SiteCard />);
  const avatar = await cardImage(inviter.avatarUrl, 168);

  return render(
    <Frame accent={identity(inviter.colour)} note={`${SITE_HOST}/join/${inviter.username}`}>
      <div style={{ display: "flex", flex: 1, alignItems: "center", gap: 52 }}>
        <CardAvatar src={avatar} name={inviter.displayName} colour={inviter.colour} size={168} />
        <div style={{ display: "flex", flexDirection: "column", flex: 1, gap: 14 }}>
          <span style={{ fontSize: 32, color: INK.muted }}>{clip(inviter.displayName, 40)} invited you to</span>
          <span style={{ fontSize: 76, fontWeight: 700, letterSpacing: -1.8, lineHeight: 1.05 }}>Join Mavuno</span>
          <span style={{ fontSize: 32, lineHeight: 1.35, marginTop: 10 }}>The social network for African Australians. Free, and takes a minute.</span>
        </div>
      </div>
    </Frame>,
  );
}
