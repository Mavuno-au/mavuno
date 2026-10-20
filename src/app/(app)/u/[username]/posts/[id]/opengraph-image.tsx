import { loadPublicPost } from "@/lib/data/posts";
import { CardAvatar, cardImage, clip, Frame, INK, OG_CONTENT_TYPE, OG_SIZE, render, shortDate, SiteCard } from "@/lib/og";

export const alt = "A post on Mavuno";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

// Shorter posts get bigger type; with a photo the text column is narrower.
function bodyType(length: number, withPhoto: boolean) {
  const steps = withPhoto
    ? [ { upTo: 70, size: 46, max: 110 }, { upTo: 150, size: 38, max: 190 }, { upTo: Infinity, size: 32, max: 260 } ]
    : [ { upTo: 90, size: 56, max: 140 }, { upTo: 180, size: 46, max: 250 }, { upTo: 300, size: 38, max: 360 }, { upTo: Infinity, size: 32, max: 470 } ];
  return steps.find((step) => length <= step.upTo) ?? { size: 32, max: 260 };
}

export default async function Image({ params }: { params: Promise<{ username: string; id: string }> }) {
  const post = await loadPublicPost((await params).id);
  if (!post) return render(<SiteCard />);

  const [avatar, photo] = await Promise.all([cardImage(post.author.avatarUrl, 96), cardImage(post.images[0]?.url ?? null, 380)]);
  const body = post.body || (post.poll ? "Asked a question" : post.images.length ? "Shared a photo" : "");
  const type = bodyType(body.length, photo !== null);
  const replies = post.replies === 1 ? "1 reply" : `${post.replies} replies`;

  return render(
    <Frame accent={INK.leaf} note={post.replies > 0 ? `${shortDate(post.createdAt)} · ${replies}` : shortDate(post.createdAt)}>
      <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
        <CardAvatar src={avatar} name={post.author.displayName} colour={post.author.colour} size={88} organisation={post.author.accountType === "organisation"} />
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontSize: 38, fontWeight: 700, letterSpacing: -0.6 }}>{clip(post.author.displayName, 34)}</span>
          <span style={{ fontFamily: "Geist Mono", fontSize: 24, color: INK.muted }}>
            @{post.author.username}
            {post.parentUsername ? `  ↳ replying to @${post.parentUsername}` : ""}
          </span>
        </div>
      </div>
      <div style={{ display: "flex", flex: 1, gap: 40, alignItems: "center", paddingTop: 28, paddingBottom: 28 }}>
        <div style={{ display: "flex", flex: 1, fontSize: type.size, lineHeight: 1.3, fontWeight: 400, letterSpacing: -0.3 }}>{clip(body, type.max)}</div>
        {photo ? <img src={photo} width={380} height={380} style={{ borderRadius: 28, objectFit: "cover" }} alt="" /> : null}
      </div>
    </Frame>,
  );
}
