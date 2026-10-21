// Session cookies are readable by the browser client, so they must at least
// never travel over plain HTTP where the site itself is served over HTTPS.
export const authCookieOptions = (siteUrl: string) => ({ secure: new URL(siteUrl).protocol === "https:" });
