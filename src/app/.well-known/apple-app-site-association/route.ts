// Tells iOS which links open the Mavuno app when it's installed: sign-up and
// sign-in emails, and invite links. Password resets and email changes stay on
// the website, which has those forms.
const APP_ID = "CUV78PLLP3.au.mavuno.app";

export function GET() {
  return Response.json({
    applinks: {
      details: [
        {
          appIDs: [APP_ID],
          components: [
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
