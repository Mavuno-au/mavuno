import { createBrowserClient } from "@supabase/ssr";
import { publicEnv } from "@/lib/env";
import { authCookieOptions } from "@/lib/supabase/cookie-options";

let client: ReturnType<typeof createBrowserClient> | undefined;

export function getBrowserClient() {
  client ??= createBrowserClient(publicEnv.supabaseUrl, publicEnv.supabaseKey, { cookieOptions: authCookieOptions(publicEnv.siteUrl) });
  return client;
}
