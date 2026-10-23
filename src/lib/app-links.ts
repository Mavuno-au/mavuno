// The website's pages that the app has screens for, and the app route that
// shows each. Shared mavuno.au links open the app (see
// .well-known/apple-app-site-association) and the app's +native-intent sends
// them here; a page the app doesn't have is null and stays on the website.
// Positional groups only: the app runs on Hermes, which leaves named groups empty.
const PAGES: { pattern: RegExp; route: (...params: string[]) => string }[] = [
  { pattern: /^\/@([^/]+)\/posts\/([^/]+)$/, route: (_username, id) => `/post/${id}` },
  { pattern: /^\/@([^/]+)\/(followers|following)$/, route: (username, direction) => `/connections/${username}?direction=${direction}` },
  { pattern: /^\/@([^/]+)(?:\/posts|\/replies|\/media)?$/, route: (username) => `/profile/${username}` },
  { pattern: /^\/spaces\/(?!new$|interests$|joined$)([^/]+)$/, route: (slug) => `/space/${slug}` },
  { pattern: /^\/events\/(?!new$)([^/]+)$/, route: (id) => `/event/${id}` },
  { pattern: /^\/opportunities\/(?!new$)([^/]+)$/, route: (id) => `/opportunity/${id}` },
  { pattern: /^\/topics\/([^/]+)$/, route: (topic) => `/topic/${topic}` },
];

export function appRoute(pathname: string): string | null {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  for (const page of PAGES) {
    const match = page.pattern.exec(path);
    if (match) return page.route(...match.slice(1));
  }
  return null;
}
