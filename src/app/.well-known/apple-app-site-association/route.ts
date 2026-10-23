// Tells iOS which links open the Mavuno app when it's installed: sign-up and
// sign-in emails the app asked for, invite links, and shared links to the
// pages the app has screens for (lib/app-links.ts turns those into its
// routes). Emails asked for on the website (via=web, see lib/email-link.ts)
// stay in the browser that asked, and so do password resets and email
// changes, whose forms are on the website. iOS takes the first rule that
// matches, so each exclude comes before the rule it carves out of, and a
// `*` matches across slashes.
const APP_ID = "CUV78PLLP3.au.mavuno.app";

export function GET() {
  return Response.json({
    applinks: {
      details: [
        {
          appIDs: [APP_ID],
          components: [
            { "/": "/auth/confirm", "?": { via: "web" }, exclude: true },
            { "/": "/auth/confirm", "?": { type: "recovery" }, exclude: true },
            { "/": "/auth/confirm", "?": { type: "email_change" }, exclude: true },
            { "/": "/auth/confirm" },
            { "/": "/join/*" },
            // Forms, feeds and calendar files the app has no screen for.
            { "/": "/@*/feed.xml", exclude: true },
            // Share images for profiles and posts are files, not pages.
            { "/": "/@*/opengraph-image", exclude: true },
            { "/": "/@*/posts/*/*", exclude: true },
            { "/": "/topics/*/*", exclude: true },
            { "/": "/spaces/new", exclude: true },
            { "/": "/spaces/interests", exclude: true },
            { "/": "/spaces/joined", exclude: true },
            { "/": "/spaces/*/*", exclude: true },
            { "/": "/events/new", exclude: true },
            { "/": "/events/*/*", exclude: true },
            { "/": "/opportunities/new", exclude: true },
            { "/": "/opportunities/*/*", exclude: true },
            { "/": "/@*/posts/*" },
            { "/": "/@*" },
            { "/": "/spaces/*" },
            { "/": "/events/*" },
            { "/": "/opportunities/*" },
            { "/": "/topics/*" },
          ],
        },
      ],
    },
  });
}
