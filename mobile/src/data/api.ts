import { z } from "zod";
import { siteLink } from "@/data/env";
import { RequestError } from "@/data/errors";
import { supabase } from "@/data/supabase";

// The website's routes that need the server (docs/MOBILE_API.md): uploads,
// translations, the data export and the background tasks. Each request carries
// the member's access token; a refused token is refreshed once and tried again.
export async function siteFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const send = async () => {
    const { data } = await supabase.auth.getSession();
    const headers = new Headers(init.headers);
    if (data.session) headers.set("Authorization", `Bearer ${data.session.access_token}`);
    return fetch(siteLink(path), { ...init, headers });
  };
  try {
    const response = await send();
    if (response.status !== 401) return response;
    const { error } = await supabase.auth.refreshSession();
    return error ? response : await send();
  } catch (error) {
    throw new RequestError(path, "offline", error instanceof Error ? error.message : "Network request failed");
  }
}

const errorBody = z.object({ error: z.string() });

// The sentence a route sent with its error, or one of our own.
export async function routeError(response: Response, fallback: string) {
  const body: unknown = await response.json().catch(() => null);
  return errorBody.safeParse(body).data?.error ?? fallback;
}

// After creating or editing anything, its link card and automatic check run
// now rather than when the database next wakes the server. If this fails
// they still run within a couple of minutes.
export function runTasks(targetId: string) {
  void siteFetch("/api/tasks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ targetId }) }).catch(() => undefined);
}
