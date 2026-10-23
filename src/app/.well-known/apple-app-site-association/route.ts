// Tells iOS which links open the Mavuno app when it's installed: sign-up and
// sign-in emails the app asked for, and invite links. Emails asked for on the
// website (via=web, see lib/email-link.ts) stay in the browser that asked,
// and so do password resets and email changes, whose forms are on the website.
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
          ],
        },
      ],
    },
  });
}
