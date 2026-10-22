import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { toViewer, VIEWER_SELECT, type Viewer } from "@/lib/viewer-row";
import { credentials } from "@/lib/bearer";
import { createClient, createGuestClient, createTokenClient, type Supabase } from "@/lib/supabase/server";
import { signInPath } from "@/lib/safe-redirect";

export { IDENTITY, type AgeStatus, type Identity, type Viewer } from "@/lib/viewer-row";

// `token` is the mobile app's access token; without it the claims come from
// the session cookie the client was built with.
async function loadViewer(supabase: Supabase, token?: string): Promise<Viewer | null> {
  const { data: claims } = await supabase.auth.getClaims(token);
  const userId = claims?.claims.sub;
  if (!userId) return null;

  const { data } = await supabase.from("profiles").select(VIEWER_SELECT).eq("id", userId).maybeSingle();
  return data ? toViewer(data) : null;
}

export const getViewer = cache(async () => loadViewer(await createClient()));

// For API routes the mobile app calls too: the viewer and a client acting as
// them, from a bearer token if the request has one, else from the cookie.
export async function getRequestViewer(request: Request): Promise<{ supabase: Supabase; viewer: Viewer | null }> {
  const given = credentials(request.headers.get("authorization"));
  switch (given.kind) {
    case "cookie":
      return { supabase: await createClient(), viewer: await getViewer() };
    case "bearer": {
      const supabase = createTokenClient(given.token);
      return { supabase, viewer: await loadViewer(supabase, given.token) };
    }
    case "malformed":
      return { supabase: createGuestClient(), viewer: null };
    default: {
      const exhaustive: never = given;
      return exhaustive;
    }
  }
}

export async function requireViewer(next = "/") {
  const viewer = await getViewer();
  if (!viewer) redirect(signInPath(next));
  return viewer;
}

export const isModerator = (viewer: Viewer | null) => viewer?.role === "moderator" || viewer?.role === "admin";
