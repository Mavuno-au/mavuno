import { publicEnv } from "@/lib/env";

// Where a link in a sign-in email lands. The email template appends the
// one-time token_hash and type (supabase/templates), and /auth/confirm checks
// them on the server, so the link works on any device, not just the browser
// that asked for it.
//
// via=web keeps the link out of the phone app (see
// .well-known/apple-app-site-association): it was asked for on the website,
// so it signs that browser in and goes to `next`. The token works once, so
// the app taking it would leave the browser signed out.
export const emailLink = (next: string) => `${publicEnv.siteUrl}/auth/confirm?via=web&next=${encodeURIComponent(next)}`;
