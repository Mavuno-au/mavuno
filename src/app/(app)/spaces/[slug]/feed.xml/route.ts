import { z } from "zod";
import { atomFeed, atomResponse } from "@/lib/atom";
import { parsePosts } from "@/lib/domain";
import { publicEnv } from "@/lib/env";
import { createGuestClient } from "@/lib/supabase/server";

const slug = z.string().regex(/^[a-z0-9-]{2,40}$/);
const spaceRow = z.object({ id: z.uuid(), slug: z.string(), name: z.string(), description: z.string(), created_at: z.string() });

// A space's posts as Atom, as a guest sees them, so it is the same for every reader.
export async function GET(_request: Request, { params }: RouteContext<"/spaces/[slug]/feed.xml">) {
  const parsed = slug.safeParse((await params).slug);
  if (!parsed.success) return new Response("Not found", { status: 404 });
  const supabase = createGuestClient();
  const { data } = await supabase.from("spaces").select("id, slug, name, description, created_at").eq("slug", parsed.data).maybeSingle();
  if (!data) return new Response("Not found", { status: 404 });
  const space = spaceRow.parse(data);
  const { data: rows, error } = await supabase.rpc("feed_space", { p_space_id: space.id, p_limit: 30 });
  if (error) return new Response("Try again later", { status: 503 });
  return atomResponse(
    atomFeed({
      siteUrl: publicEnv.siteUrl,
      path: `/spaces/${space.slug}`,
      title: `${space.name} on Mavuno`,
      subtitle: space.description || undefined,
      updated: space.created_at,
      posts: parsePosts(rows).flatMap((row) => (row.kind === "post" && row.status === "published" ? [row] : [])),
    }),
  );
}
