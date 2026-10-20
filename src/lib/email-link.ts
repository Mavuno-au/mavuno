import { publicEnv } from "@/lib/env";

// Where a link in a sign-in email lands. The email template appends the
// one-time token_hash and type (supabase/templates), and /auth/confirm checks
// them on the server, so the link works on any device, not just the browser
// that asked for it.
export const emailLink = (next: string) => `${publicEnv.siteUrl}/auth/confirm?next=${encodeURIComponent(next)}`;
