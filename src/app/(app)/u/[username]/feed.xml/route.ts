import { z } from "zod";
import { atomFeed, atomResponse } from "@/lib/atom";
import { parsePosts } from "@/lib/domain";
import { publicEnv } from "@/lib/env";
import { createGuestClient } from "@/lib/supabase/server";

const profileRow = z.object({ id: z.uuid(), username: z.string(), display_name: z.string(), bio: z.string(), created_at: z.string() });

// A profile's posts as Atom, as a guest sees them, so it is the same for every reader.
export async function GET(_request: Request, { params }: RouteContext<"/u/[username]/feed.xml">) {
  const supabase = createGuestClient();
  const { data } = await supabase.from("profiles").select("id, username, display_name, bio, created_at").eq("username", (await params).username.toLowerCase()).maybeSingle();
  if (!data) return new Response("Not found", { status: 404 });
  const profile = profileRow.parse(data);
  // Deactivated as under 16 reads as missing here too, as on the profile page.
  const hidden = await supabase.rpc("profile_hidden", { p_profile_id: profile.id });
  if (hidden.error || hidden.data === true) return new Response("Not found", { status: 404 });
  const { data: rows, error } = await supabase.rpc("feed_profile", { p_profile_id: profile.id, p_kind: "posts", p_limit: 30 });
  if (error) return new Response("Try again later", { status: 503 });
  return atomResponse(
    atomFeed({
      siteUrl: publicEnv.siteUrl,
      path: `/@${profile.username}`,
      title: `${profile.display_name} (@${profile.username}) on Mavuno`,
      subtitle: profile.bio.split("\n")[0] || undefined,
      updated: profile.created_at,
      posts: parsePosts(rows).flatMap((row) => (row.kind === "post" && row.status === "published" ? [row] : [])),
    }),
  );
}
