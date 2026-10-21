import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { publicEnv } from "@/lib/env";
import { authCookieOptions } from "@/lib/supabase/cookie-options";
import { DISPLAY_TIME_ZONE } from "@/lib/format";

// Remembers the day (and member) last recorded as active, so mark_seen runs at
// most once a day per browser rather than on every request.
const SEEN_COOKIE = "mavuno-seen";
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: DISPLAY_TIME_ZONE }).format(new Date());

// Refreshes the Supabase session cookie before every page renders, and counts
// signed-in members as active for the day (see /operations).
export async function proxy(request: NextRequest) {
  // Profiles live at /@username; /u/ is only the route behind that rewrite, so
  // anyone landing on it is sent to the one address search engines should index.
  const { pathname } = request.nextUrl;
  if (pathname.startsWith("/u/") && !pathname.includes("/opengraph-image")) {
    const url = request.nextUrl.clone();
    url.pathname = `/@${pathname.slice(3)}`;
    return NextResponse.redirect(url, 308);
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(publicEnv.supabaseUrl, publicEnv.supabaseKey, {
    cookieOptions: authCookieOptions(publicEnv.siteUrl),
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet, headers) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options);
        for (const [key, value] of Object.entries(headers)) response.headers.set(key, value);
      },
    },
  });

  const { data } = await supabase.auth.getClaims();
  const memberId = data?.claims.sub;
  if (memberId) {
    const seen = `${today()}.${memberId}`;
    if (request.cookies.get(SEEN_COOKIE)?.value !== seen) {
      const { error } = await supabase.rpc("mark_seen");
      if (!error) response.cookies.set(SEEN_COOKIE, seen, { httpOnly: true, sameSite: "lax", secure: request.nextUrl.protocol === "https:", maxAge: 60 * 60 * 36, path: "/" });
    }
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon|apple-icon|manifest.webmanifest|robots.txt|sitemap.xml|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
