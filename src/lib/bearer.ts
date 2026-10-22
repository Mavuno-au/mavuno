// The website signs requests with its session cookie; the mobile app has no
// cookies and sends the access token Supabase gave it instead. A request
// with an Authorization header is judged by that header alone, so a bad
// token never falls back to whatever cookie came with it.
export type Credentials = { kind: "cookie" } | { kind: "bearer"; token: string } | { kind: "malformed" };

// A JWT is three base64url parts. Anything else, including a publishable
// key, is refused before it reaches Supabase.
const JWT = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
const MAX_TOKEN = 8192;

export function credentials(authorization: string | null): Credentials {
  if (authorization === null) return { kind: "cookie" };
  const match = /^Bearer[ ]+(\S+)$/i.exec(authorization.trim());
  const token = match?.[1];
  return token && token.length <= MAX_TOKEN && JWT.test(token) ? { kind: "bearer", token } : { kind: "malformed" };
}
