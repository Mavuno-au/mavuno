import "server-only";
import { createServerClient } from "@supabase/ssr";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { publicEnv } from "@/lib/env";
import { authCookieOptions } from "@/lib/supabase/cookie-options";
import { serverEnv } from "@/lib/server-env";

export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(publicEnv.supabaseUrl, publicEnv.supabaseKey, {
    cookieOptions: authCookieOptions(publicEnv.siteUrl),
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll(cookiesToSet) {
        // Server Components cannot set cookies; the proxy refreshes the session instead.
        try {
          for (const { name, value, options } of cookiesToSet) cookieStore.set(name, value, options);
        } catch {}
      },
    },
  });
}

export type Supabase = Awaited<ReturnType<typeof createClient>>;

// Acts as whoever the mobile app's access token belongs to. The database
// checks the token on every query; the caller checks it first with getClaims.
export function createTokenClient(token: string): Supabase {
  return createSupabaseClient(publicEnv.supabaseUrl, publicEnv.supabaseKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// Bypasses row level security. Only for server jobs that act on nobody's behalf.
export function createServiceClient() {
  if (!serverEnv.SUPABASE_SERVICE_ROLE_KEY) return null;
  return createSupabaseClient(publicEnv.supabaseUrl, serverEnv.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// Reads as a guest whatever session the request carries, for what search
// engines and feed readers see.
export function createGuestClient() {
  return createSupabaseClient(publicEnv.supabaseUrl, publicEnv.supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
