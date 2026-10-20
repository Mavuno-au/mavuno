# Product metrics

What `/operations` measures, why, and where each number comes from. Admins only.

Mavuno succeeds when a newcomer finds their people in the first day, gets a reply when they speak, and keeps coming back. The metrics follow that path rather than counting page views.

## Sources

| Source | What it holds | Who can read it |
|---|---|---|
| `member_activity` | The last day each member used Mavuno (Sydney date) | Nobody through the API; only `admin_metrics()` and the member's own export |
| `active_member_counts` | How many members were active each day, with no identities | Nobody through the API; only `admin_metrics()` |
| Posts, follows, profiles | The existing tables | As their policies allow |
| Fathom (optional, paid) | Page views, `guest-visit`, `signup` | Whoever has the Fathom account; admins through the Traffic tab |

The proxy calls `mark_seen()` for a signed-in member at most once a day per browser (the `mavuno-seen` cookie holds the date and member). Repeated calls the same day change nothing. Tracking started with migration `product_metrics`, so retention for people who joined before then reads low until enough days have passed.

## Ranges and changes

Metrics, Activity and Traffic show the last **7 or 30 Sydney days** (30 by default; `?range=7`). Each rate shows its change in **percentage points** since the same number of days just before, and the rate that **fell most** is marked. That is the trend, not the lowest level: rates of different steps can't be compared with each other, only with their own past. A change is left out while either period has nothing to count.

## Metrics tab

**Active members.** Members seen today, in the last 7 days and in the last 30 days. *Daily / monthly* is today's actives as a share of the month's: how habitual Mavuno is. These don't follow the range: `member_activity` only keeps each member's latest day.

**Sign-ups.** People (not organisations) who created an account today, in the range, in the range before, and in all.

**Activation.** Of people who joined in the range and are at least 12 hours old, the share who *received value* within their first 12 hours, in either of two ways:
- *As a reader*: liked or saved posts written by 3 or more different people (not themselves). Counting people rather than likes means the feeds showed them several people, not one friend.
- *As an author*: posted, and someone else replied to it, quoted it or liked it, within the same 12 hours.

Posting alone isn't activation: posting gives value, and someone who posts into silence is the most likely to leave. Twelve hours stands for the first visit, so activation and coming back the next day don't overlap. The chart shows each sign-up day's rate; a day stays lighter until its last sign-ups are 12 hours old. It isn't an experiment: a launch or a busy day also changes who signs up, so read a trend over several days. It is a hypothesis; see "Checking activation" below.

**First day.** Of people who joined in the range and have had a full first day:
- *Finished setup*: completed or skipped onboarding.
- *Followed someone*: followed at least one profile within 24 hours.
- *Follows in the first 24 hours*: the median number of profiles they followed, counting those who followed no one.
- *Posted or replied*: wrote anything within 24 hours.
- *Followed back*: of those who followed someone on day one, how many were followed back by one of those profiles within a week. Whether the community notices newcomers.

**Coming back.** Of people whose day N (N = 1, 7, 14) fell in the range and is over, the share seen on day N or later, from the last day seen. A day N before tracking started doesn't count, since a visit then left no trace. "Still coming back after N days", which always reads higher than the "active on day N" retention public benchmarks use.

**Conversation.**
- *Posts answered within a day*: top-level posts published in the range, at least a day old, that someone else replied to, quoted or liked within 24 hours. The note gives the median time to that first answer, among answered posts.
- *First posts answered within a day*: the same, for posts that were their author's very first post. A newcomer who posts into silence rarely posts again.
- *Active members who posted*: the share of the month's active members who published anything that month. Low means most people only read.

**Bars.** Daily active members, sign-ups, and published posts and replies, for each day of the range. Today's bar is still counting.

## Activity tab

- *Today*: posts, replies, sign-ups, messages and reports today against yesterday, Sydney days.
- *Posts by status*: posts and replies written in the range, by published, waiting for review, removed and deleted.
- *Busiest authors*: the 10 profiles with the most published posts and replies in the range, linked. Only published posts count, so the list shows nothing a visitor to those profiles couldn't count.

## Traffic tab (optional)

Only with Fathom, a paid service: set `NEXT_PUBLIC_FATHOM_SITE_ID` and a read token in `FATHOM_API_KEY`. Without them the tab explains how to turn it on and nothing is requested. With them it shows visitors on the site now, visitors and page views in the range, top pages, referrers, countries and devices (the top 10 by visitors), and the sign-up rate.

**Sign-up rate** = people who sent a `signup` event ÷ people who sent a `guest-visit` event, both counted by Fathom (`unique_conversions`). With both sides from the same tool, ad blockers hide the same share of each; sign-ups from the database over visitors from Fathom would overstate it. Only visitors not signed in send `guest-visit`, since members browsing aren't prospects. Current visitors are cached for a minute and reports for five, because every call counts against Fathom's limits.

## Health tab

Refreshes every 15 seconds while it is on screen.

| Check | Needs attention when |
|---|---|
| Reports | The oldest open report has waited more than a day |
| Review queue | The oldest pending post has waited more than a day |
| Erasing deleted posts | A deleted post is older than five minutes (the `pg_cron` purge has stopped) |
| Removing old files | Files from erased posts have waited over a day (schedule `/api/maintenance`) |
| Publishing scheduled posts | A scheduled post is more than five minutes late |
| Deleting under-16 accounts | A deactivated account is more than a day past its 30 days (the daily job has stopped) |
| Scheduled jobs | A `pg_cron` job failed in the last day, is paused, or `pg_cron` can't be read |
| Suspended accounts | Informational |

Scheduled jobs come from `cron.job` and `cron.job_run_details`, which only the role that scheduled them can read, through the `SECURITY DEFINER` function `cron_health()` that no API role can call. It reads the newest 10,000 runs (more than three days), since the run history has no index on time.

It also shows the last 24 hours of sign-ups, posts, messages and reports.

## Checking activation

Activation is right if it predicts coming back. Once a few weeks of sign-ups have passed day 14, compare how many activated and non-activated members came back, for each path, and compare day-one follows of members who stayed with those who left, to find Mavuno's own threshold. Change the definition, the window or the 3 people if another predicts better.

## Fathom events

Set `NEXT_PUBLIC_FATHOM_SITE_ID` to load Fathom; without it no script loads. Fathom uses no cookies.

| Event | Sent when |
|---|---|
| `guest-visit` | Once per browser session for someone who isn't signed in |
| `signup` | When a new member finishes or skips onboarding |

Together with page views these give the top of the funnel: visitors, then sign-ups, which `/operations` continues from.

## Adding a metric

Add it to `metric_rates()` (anything that should show a change), `admin_metrics()`, `admin_activity()` or `admin_health()` in a new migration, extend the schema in `src/lib/data/operations.ts`, show it on the page, describe it here, and cover it in `scripts/test-db.mjs`. Keep counts anonymous: no metric should need to know who did something, only how many.
