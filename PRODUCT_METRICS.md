# Product metrics

What `/operations` measures, why, and where each number comes from. Admins only.

Mavuno succeeds when a newcomer finds their people in the first day, gets a reply when they speak, and keeps coming back. The metrics follow that path rather than counting page views.

## Sources

| Source | What it holds | Who can read it |
|---|---|---|
| `member_activity` | The last day each member used Mavuno (Sydney date) | Nobody through the API; only `admin_metrics()` and the member's own export |
| `active_member_counts` | How many members were active each day, with no identities | Nobody through the API; only `admin_metrics()` |
| Posts, follows, profiles | The existing tables | As their policies allow |
| Fathom (optional) | Page views, `guest-visit`, `signup` | Whoever has the Fathom account |

The proxy calls `mark_seen()` for a signed-in member at most once a day per browser (the `mavuno-seen` cookie holds the date and member). Repeated calls the same day change nothing. Tracking started with migration `product_metrics`, so retention for people who joined before then reads low until enough days have passed.

## Metrics tab

**Active members.** Members seen today, in the last 7 days and in the last 30 days. *Daily / monthly* is today's actives as a share of the month's: how habitual Mavuno is.

**Sign-ups.** People (not organisations) who created an account, with the last 7 days compared to the 7 before.

**First day.** Everyone who joined in the last 30 days and has had a full first day.
- *Finished setup*: completed or skipped onboarding.
- *Followed someone*: followed at least one profile within 24 hours. The strongest early sign that someone found their people.
- *Posted or replied*: wrote anything within 24 hours.
- *Followed back*: of those who followed someone on day one, how many were followed back by one of those profiles within a week. Whether the community notices newcomers.

**Coming back.** Of people who joined between N and N + 60 days ago, the share seen on day N or later (N = 1, 7, 14). Based on the last day seen, so it reads as "still coming back after N days".

**Conversation.**
- *Posts answered within a day*: top-level posts published 1 to 31 days ago that got a reply from someone other than the author within 24 hours. A newcomer who posts into silence rarely posts again.
- *Active members who posted*: the share of the month's active members who published anything that month. Low means most people only read.

**Last 30 days.** Daily active members, sign-ups, and published posts and replies.

## Health tab

| Check | Needs attention when |
|---|---|
| Reports | The oldest open report has waited more than a day |
| Review queue | The oldest pending post has waited more than a day |
| Erasing deleted posts | A deleted post is older than five minutes (the `pg_cron` purge has stopped) |
| Removing old files | Files from erased posts have waited over a day (schedule `/api/maintenance`) |
| Suspended accounts | Informational |

It also shows the last 24 hours of sign-ups, posts, messages and reports.

## Fathom events

Set `NEXT_PUBLIC_FATHOM_SITE_ID` to load Fathom; without it no script loads. Fathom uses no cookies.

| Event | Sent when |
|---|---|
| `guest-visit` | Once per browser session for someone who isn't signed in |
| `signup` | When a new member finishes or skips onboarding |

Together with page views these give the top of the funnel: visitors, then sign-ups, which `/operations` continues from.

## Adding a metric

Add it to `admin_metrics()` or `admin_health()` in a new migration, extend the schema in `src/lib/data/operations.ts`, show it on the page, describe it here, and cover it in `scripts/test-db.mjs`. Keep counts anonymous: no metric should need to know who did something, only how many.
