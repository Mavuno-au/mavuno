# Mavuno

The social network for African Australians. *Mavuno* is Swahili for harvest.

Members post text, photos, links, videos and polls; follow people and organisations; join city and interest spaces; find events and opportunities (jobs, scholarships, grants, mentoring, business); message one to one or in groups; and find each other city by city without anyone's precise location being stored.

The product keeps a few firm rules: a quiet three-column layout, flat rows instead of cards, immutable posts with a 30-second undo on delete, moderation that starts with reports, grouped notifications, mutes and blocks that apply everywhere, and storing as little as possible about people.

## Stack

- [Next.js 16](https://nextjs.org) (App Router, React 19, Server Actions, `src/proxy.ts`) and TypeScript in strict mode
- [Supabase](https://supabase.com): Postgres with row level security, Auth (email and password, magic links, optional Google), Storage and Realtime
- Tailwind CSS v4, zod at every boundary, Vitest for unit tests, PGlite for database tests
- The Supabase agent skills (`.claude/skills/`) for anyone working on this with Claude Code

There is no PHP and no separate API server. The browser and the Next.js server talk to Supabase with the signed-in member's session, and the database decides what each person may read and write.

## Getting started

Requirements: Node 20.9 or newer and pnpm. For a local database you also need Docker and the Supabase CLI (installed as a dev dependency).

```bash
pnpm install
cp .env.example .env.local
```

### Option A: a hosted Supabase project

1. Create a project at [supabase.com](https://supabase.com) and copy its URL and publishable key into `.env.local`.
2. Add the database connection string to `.env.local` as `SUPABASE_DB_URL` (Project Settings → Database → Connection string, the session pooler URI with your password filled in), then push the schema over that direct connection:

   ```bash
   pnpm db:push
   ```

3. In the dashboard, under Authentication → URL Configuration, set the Site URL to your site and add `<site>/auth/callback` to the redirect URLs.
4. Enable `pg_cron` under Database → Extensions if the maintenance migration reported it missing, then run `pnpm db:push` again.
5. Check the result with Supabase's advisors. Only "unused index" notes and the internal tables without policies (read and written only by database functions) should remain:

   ```bash
   pnpm supabase db advisors --db-url "$SUPABASE_DB_URL" --type all
   ```

### Option B: a local Supabase stack

```bash
pnpm db:start
```

With Podman instead of Docker, point the CLI at its socket first: `export DOCKER_HOST="$(podman machine inspect --format '{{.ConnectionInfo.PodmanSocket.Path}}')"`. The phone app only needs the database, auth and the API gateway, so `pnpm supabase start -x realtime,storage-api,imgproxy,mailpit,postgres-meta,studio,edge-runtime,logflare,vector,supavisor` keeps a small Mac comfortable.

Copy the API URL and publishable key it prints into `.env.local`, then load the schema and the demo data:

```bash
pnpm db:reset
```

The demo accounts are `amara@example.com` (an admin), `kofi@example.com`, `hana@example.com` and `tendai@example.com`, all with the password `mavuno-demo`. Never run the seed against production.

### Run it

```bash
pnpm dev
```

Open http://localhost:3000.

### Your first moderator

Moderators handle reports and the review queue. Make yourself an admin once, in the SQL editor:

```sql
update public.profile_settings set site_role = 'admin'
where id = (select id from public.profiles where username = 'your_username');
```

Admins can then make other members moderators from Moderation → Admin.

## Environment

| Variable | Required | |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | yes | Project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | yes | Publishable (anon) key. `NEXT_PUBLIC_SUPABASE_ANON_KEY` also works |
| `NEXT_PUBLIC_SITE_URL` | yes | Public URL, used in auth emails and metadata |
| `NEXT_PUBLIC_AUTH_GOOGLE` | no | `true` shows "Continue with Google". Enable the provider in Supabase first |
| `TRANSLATE_API_URL`, `TRANSLATE_API_KEY` | no | A [LibreTranslate](https://github.com/LibreTranslate/LibreTranslate)-compatible API. Without it, Translate opens Google Translate |
| `SUPABASE_SERVICE_ROLE_KEY` | for photos | Server only. Stores uploaded photos after re-encoding them; without it photo uploads are off. Also fetches link cards, caches translations and lets `/api/maintenance` remove erased files |
| `CRON_SECRET` | for erasing files | Vercel's cron sends it to the routes in `vercel.json`: `/api/tasks` (link cards and automatic checks that are due or being retried), `GET /api/maintenance` (removes erased photos from Storage daily) and `/api/indexnow` |
| `MAINTENANCE_SECRET` | no | Bearer token for `POST /api/maintenance`, for a scheduler other than Vercel's |
| `OPENAI_API_KEY` | no | Turns on the automatic check: posts, events and opportunities from members without a track record (a member for under a week, fewer than three things published, or reported in the past week) go to OpenAI's `omni-moderation-latest` after they are created, whichever way they were created, and anything flagged goes back to the review queue with its categories. It never rejects. Needs `SUPABASE_SERVICE_ROLE_KEY`; without either key nothing is sent |
| `NEXT_PUBLIC_FATHOM_SITE_ID` | no | [Fathom](https://usefathom.com) site ID for cookieless visit counts. Nothing loads without it |
| `NEXT_PUBLIC_GA_MEASUREMENT_ID` | no | Google Analytics 4 ID (G-…). Advertising features and Google Signals stay off |
| `SUPABASE_DB_URL` | for `pnpm db:push` | Direct Postgres connection string. Never commit it |
| `RESEND_API_KEY`, `SUPABASE_ACCESS_TOKEN` | for `pnpm email:apply` | Sends sign-in emails from hello@mavuno.au through Resend, with the templates in `supabase/templates` (`pnpm email:build` regenerates them) |

## How it works

### The database is the source of truth

Everything that has to be true lives in `supabase/migrations`:

| Migration | Contents |
|---|---|
| `core` | cities, public `profiles`, private `profile_settings`, organisations and their teams, follows, blocks, mutes |
| `community` | spaces, events and RSVPs, opportunities |
| `posts` | posts, images, polls, likes, saves, translations, notifications, publishing, delete and undo, trending score |
| `messages` | conversations, participants, messages, reactions, message requests |
| `moderation` | reports, review and report queues, moderator and admin actions |
| `feeds` | `post_details` and every feed, search, discovery, nearby, export and account deletion |
| `storage_realtime` | the `media` (public) and `message-media` (private) buckets, Realtime publication |
| `reference_data` | Australian cities and the official city and interest spaces |
| `maintenance` | schedules the purge of deleted posts with `pg_cron` |
| `api_grants` | the whole Data API surface: which tables, columns and functions guests and members can reach |
| `rls_initplan_and_foreign_key_indexes` | fixes from Supabase's advisors: per-query `auth.uid()` in policies, an index on every foreign key |
| `scheduled_posts` | posts scheduled up to 30 days ahead, published each minute by `pg_cron` through `create_post` as the member who scheduled them |
| `age_assurance_and_notices` | the 16+ age check (only when it was confirmed is stored), deactivating and reinstating under-16 accounts and the record of those steps, moderation notices that name the rule, and legal complaints with a 7-day target |
| `operations_insights` | what `/operations` reads: activation within 12 hours, rates for a range and the one before, today's activity, and health checks for scheduled posts, under-16 deletions and `pg_cron` runs (see `PRODUCT_METRICS.md`) |
| `server_side_images` | WebP-only buckets, no direct uploads to Storage (`can_upload` decides who may upload through `/api/upload`), and posts and messages that only point at re-encoded files |
| `conversation_visibility` | the newest replies under each post in a page of a feed in one query, Trending drawn at random by hot score with a new seed each visit (likes on a thread's replies count towards it), who liked a post for its author only, mention suggestions from the conversation, and profile cards |
| `automatic_check` | `post_flags`, and the service-role functions the automatic check uses to read a post and hold it for review (never reject it) |
| `duplicate_post_hold` | `create_post` holds for review a third copy of the same text (20 characters or more, ignoring case and spacing) from one person within an hour |
| `feed_cursors_and_search` | every list of posts pages on its sort key and id, so posts published together are never skipped; Latest and Following sort by publication, so a post approved after review appears at the top; post search ranked by relevance halving every 30 days, with trigram and full-text indexes it can use under row level security |
| `background_tasks` | the queue a trigger fills when a post, event or opportunity is created (its link card, its automatic check), three tries a minute and ten minutes apart; link cards written by the server only; the automatic check for events and opportunities and the week-and-three-posts track record |
| `bans_rules_and_moderation_people` | bans (`moderate_ban`) that hide what the person published, cancel their scheduled posts and keep peppered hashes of their sign-in identities in `banned_identities`, checked by Supabase Auth's before-user-created hook; suspensions by interval that extend rather than replace, with the end in the notice; the community rules accepted once before the first post or listing (`accept_rules`, enforced by triggers); `moderation_log`, `moderate_lift_suspension` and `moderate_restore` for the People tab; reports that only count from members with standing |
| `privacy_and_security_fixes` | `realtime.messages` policies for the private channels, reactions limited to listed emoji and 60 a minute (and no longer streamed), message photos queued for erasure with their message, conversation or account, avatars, banners and event covers limited to this project's Storage (`storage_origins`) or the Google photo, and 7 days of `pg_cron` history |
| `people_and_discovery` | suspended and age-deactivated accounts in no list of people (search, suggestions, nearby, profile cards, mention suggestions, followers and following); suggestions only for people with a visible post (verified organisations excepted); `suggestion_dismissals` ("Not for me", private to the member, in the export, erased with either account); people search over headlines and bios with indexes it can use; `profile_connections` for follower and following lists, with blocks applied before the page is cut and who follows the viewer |
| `notifications_messages_and_limits` | notifications grouped in the database (likes by post, follows by the reader's day, RSVPs by event, mentions by thread, every reply on its own), a badge that counts groups, marking read by tab, notifications about posts since held and follows since undone hidden, a notice when a held post goes up; blocking hides the direct conversation and removes likes both ways, nobody joins a group with someone they have a block with, people added to a group read from when they joined unless the history is shared (`visible_from`), message requests in the Messages badge; follows (30), likes (60) and saves (60) limited per minute in `rate_limits` |
| `wake_background_tasks` | `wake_background_tasks()`, run by `pg_cron` every two minutes, calls `/api/tasks` (URL and `TASKS_SECRET` from Vault) only when a task is due |
| `server_errors_and_switches` | `server_errors`, one row per error and route pattern with a count (written by the app's instrumentation through the service role, nothing about who was asking, pruned after 14 days); three switches in `site_settings` that pause the automatic check, link cards and photo uploads without a deploy, with queued tasks waiting rather than skipped; `admin_health()` reports failed and held tasks, recent errors and the switches |
| `message_link_cards` | the first link in a message gets a card: `first_url()` reads it from the body in a trigger (the insert grant never covers the link columns), the card is fetched by the same background task as a post's and written only by the service role through `set_message_link_preview`, with the checks both share in `clean_link_preview` |
| `suggestions_without_a_post` | suggestions no longer need a post: while the network is small that left nobody to suggest; people who have posted and verified organisations come first, everyone discoverable is in the pool |
| `sanctioned_operators_listing_edits_messaging_and_links` | four audit fixes: `is_moderator()` and `is_admin()` require `is_active_member()` and nobody changes their own sanctions; an edit to a published event or opportunity is reviewed like a new one (`review_listing_edit`, `recheck_listing`); group management, request acceptance, reactions and channel broadcasts require an active member; `is_web_url` holds event, opportunity and profile links to addresses a browser can parse, and `displayUrl` never throws on old rows |
| `audit_low_findings` | ten audit fixes: post images from this project's Storage only; at most ten mentions a post; listings counted in `rate_limits`; a message photo path belongs to one message and is erased only once nothing shows it; blocks follow the writer into quote cards and notifications; a restore is bound to the decision it names; a sanctioned account's email cannot change; an under-16 deactivation keeps the identity hash for a year (`before_user_created` says so); the purge matches folders as uuids; team membership is an invitation (`organisation_members.accepted_at`, `accept_team_invitation`) that cannot be sent across a block |
| `sign_up_username_taken` | a username chosen at sign-up that another account took moments earlier stops the sign-up instead of becoming `member_<id>`; sign-ups without a chosen name keep the generated one |
| `invite_links` | personal invite links (`/join/<username>`): `invites` records who invited whom, readable only by those two and erased with the member who joined; the inviter's username rides in the sign-up's metadata and is recorded when the email is confirmed (`on_auth_user_invited`), or by `accept_invite` within an hour of a Google sign-up; the two follow each other and the inviter gets a `joined` notification; `admin_metrics()` counts invited sign-ups; the export lists both sides |

Every table has row level security, and `api_grants` declares every privilege explicitly: Supabase no longer exposes new tables and functions automatically, and internal functions (publishing, notifying, purging) get no grant at all, so only database code can call them. Writes that need more than a one-row check go through `SECURITY DEFINER` functions such as `create_post`, `report_content` and `start_direct_conversation`, which check permissions, limits and blocks themselves. Rate limits (posts, messages, reports, listings, message requests, follows, likes, saves and reactions) are enforced in the database, so they hold for every client.

### Rules every feature keeps

- **Posts go up straight away; moderation starts with reports.** Members accept the community rules once before their first post, event or opportunity (`profile_settings.rules_accepted_at`, checked by triggers). Three reports from members with standing (a member for a week, something published, not suspended, no report of theirs dismissed in the last 30 days) hold a post for review, and one such report puts its author's new content in front of a moderator for a week; reports from newer accounts are shown to moderators but hold nothing. Content from members without a track record gets the automatic check. Admins can turn premoderation on during a wave of spam, after which new members' content waits for a moderator until they have been around an hour and had something approved. Authors see their own pending items. Removals and suspensions name the rule and link to an appeal; a ban hides what the person published and outlives the account (see the next rule).
- **Posts are immutable.** Create and delete, never edit. Deleting blanks a post at once and keeps its content privately for 30 seconds so Undo works; then it is erased and an authorless tombstone keeps other people's replies in their thread.
- **Mutes and blocks apply everywhere**: feeds, threads, search, suggestions, notifications and messages. A muted person's profile can still be visited; a blocked one is unavailable in both directions.
- **Store as little as possible.** Settings are private to their owner. Location is a city, never coordinates. One exception: a ban, or deleting an account while suspended, keeps an HMAC of the normalised email address and each outside sign-in (`banned_identities`, pepper in Vault as `identity_pepper`) until the ban or suspension would have ended, and `before_user_created` refuses sign-ups that match. Photos are re-encoded on the server (`/api/upload`, with sharp) before they are stored, which strips EXIF and location data; members cannot write to Storage directly. Deleting an account erases the profile, posts, likes, messages sent, settings and uploaded files. Profile and event images can only be this project's Storage files (or the Google photo someone signed up with), so viewing a page never tells another host who looked; another project or a local stack adds its Storage origin to `public.storage_origins`. The JSON export includes everything stored about the person.

### App structure

```
src/
  app/(app)/        pages inside the three-column shell
  app/(auth)/       sign in, sign up, password reset
  app/onboarding/   first-time setup
  app/actions/      server actions; each returns Result<T>
  app/api/          upload, translate, export, maintenance, tasks
  components/       ui, shell, people, post, messages, community, settings, moderation
  lib/domain.ts     zod schemas that turn database rows into domain types
  lib/data/         server-only loaders
  lib/feeds.ts      every list of posts is a FeedSource
mobile/             the iPhone and Android app (Expo), which imports src/lib's plain modules
```

`PRODUCT.md` and `DESIGN.md` describe the product rules and design system, `PRODUCT_METRICS.md` what `/operations` measures and why, `AGENTS.md` the engineering guidelines, `mobile/README.md` how to run and build the app, and `docs/MOBILE_API.md` what the mobile app calls (the upload, translate, export and tasks routes take a Supabase access token as `Authorization: Bearer` as well as the session cookie). The logo files on `/brand` are drawn from `src/lib/brand-mark.ts` by `pnpm brand`.

Rows from Supabase are parsed once in `lib/domain.ts` or a loader, into discriminated unions (a `PostRow` is a `post` or a `tombstone`; a quoted post is a `post`, `deleted` or `unavailable`). Components trust those types.

## Checks

```bash
pnpm check
```

This runs the type checker, ESLint, the unit tests (`pnpm test`) and the database tests (`pnpm test:db`). The database tests apply every migration to an embedded Postgres with stand-ins for Supabase's `auth` and `storage` schemas, then exercise the policies, triggers and functions as different members: premoderation, blocking, message requests, organisations, reports, undo, export and account deletion. CI runs the same checks and a production build on every push.

## Maintenance

- Scheduled posts are published and deleted posts are purged every minute by `pg_cron`. Without it, call `POST /api/maintenance` with `Authorization: Bearer $MAINTENANCE_SECRET` on a schedule.
- Erased photos (from deleted posts, removed or deleted messages, and deleted accounts) are queued in `storage_cleanup`, and `/api/maintenance` removes them from Storage, which a database function cannot do. Vercel's cron calls `GET /api/maintenance` daily with `CRON_SECRET` (`vercel.json`).
- `pg_cron` keeps 7 days of run history, and prunes the hashes of ended suspensions daily (`/api/maintenance` does too).
- **Bans need two settings outside migrations.** In the SQL editor, `select vault.create_secret('<a long random string>', 'identity_pepper');` (without it `moderate_ban` refuses, and deleting a suspended account records nothing). Under Authentication → Hooks, enable the Before User Created hook as a Postgres function, schema `public`, function `before_user_created`; `supabase/config.toml` does this for a local stack.
- Realtime channels are private (`private: true`, with policies on `realtime.messages`): only a conversation's participants hear its typing, read and reaction pings. Turn off "Allow public access" in Supabase's Realtime settings so no channel can be joined without them.
- Accounts deactivated for being under 16 are deleted after 30 days unless a moderator reinstates them, daily by `pg_cron` or by `/api/maintenance`. See `docs/AGE_ASSURANCE.md` and `docs/ONLINE_SAFETY.md` for what the online safety law asks of Mavuno and how it is reviewed.
- Link cards and automatic checks run straight after the post that needs them. Retries, and work a scheduled post or a direct API call queued, are picked up by later requests and by `GET /api/tasks` (daily on Vercel's Hobby plan, with `Authorization: Bearer $CRON_SECRET`). Failed tasks are kept for a week.
- Translations are cached for seven days.
- The sitemap is split into files under `/sitemap/` (`pages.xml`, then `people-N.xml` and `posts-N.xml` with 20,000 addresses each, oldest first); `/sitemap.xml` is the index and `robots.txt` lists every file. They refresh hourly, and `/api/indexnow` sends the addresses that changed in the last day to IndexNow.
- Server errors (pages, route handlers, server actions) are counted in `server_errors` by route pattern and error digest, never with a request or anything about a person, and forgotten after 14 days (daily by `pg_cron` or by `/api/maintenance`). Only production records them; in development they stay in the terminal. The reference shown on an error page is the same digest.
- Admins can pause the automatic check, link cards and photo uploads from Moderation → Admin while a provider is down or something is being abused. Tasks queued meanwhile wait and run once the switch is back on.
- `GET /api/health` answers `{ ok, database }` for an uptime monitor with one guest query, and `GET /api/version` is a static file naming the live deployment. A page still open across a deploy compares the two after a failed poll or a long time away, and offers one reload.
- Admins see product metrics, the day's activity and whether background jobs are keeping up (pg_cron runs, the task queue, server errors and the switches) at `/operations`.

## Known limits

- Message bodies are protected by row level security but not encrypted at rest beyond Supabase's disk encryption.
- Post language is chosen by the author in the composer rather than detected.
- The privacy policy and terms are plain-language starting points. Have them reviewed before launch.
