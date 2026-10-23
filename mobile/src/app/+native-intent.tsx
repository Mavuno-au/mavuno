import { appRoute } from "@/lib/app-links";
import { env } from "@/data/env";

// A shared mavuno.au link arrives with the website's address, such as
// /@amina/posts/…; the screen that shows it has its own route. Anything else,
// such as an invite or a sign-in email, already matches a route and passes
// through. This runs before the app has rendered, so it must never throw.
export function redirectSystemPath({ path }: { path: string; initial: boolean }) {
  if (!URL.canParse(path, env.siteUrl)) return path;
  const url = new URL(path, env.siteUrl);
  if (url.origin !== new URL(env.siteUrl).origin) return path;
  return appRoute(url.pathname) ?? path;
}
