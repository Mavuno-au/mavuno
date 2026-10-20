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
5. Check the result with Supabase's advisors. Only "unused index" notes and the two internal tables without policies should remain:

   ```bash
   pnpm supabase db advisors --db-url "$SUPABASE_DB_URL" --type all
   ```

### Option B: a local Supabase stack

```bash
pnpm db:start
```

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
| `SUPABASE_SERVICE_ROLE_KEY` | no | Server only. Caches translations and lets `/api/maintenance` remove erased files |
| `MAINTENANCE_SECRET` | no | Bearer token for `POST /api/maintenance` |
| `NEXT_PUBLIC_FATHOM_SITE_ID` | no | [Fathom](https://usefathom.com) site ID for cookieless visit counts. Nothing loads without it |
| `FATHOM_API_KEY` | no | Server only. A Fathom API token that can read that site, for Operations → Traffic |
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

Every table has row level security, and `api_grants` declares every privilege explicitly: Supabase no longer exposes new tables and functions automatically, and internal functions (publishing, notifying, purging) get no grant at all, so only database code can call them. Writes that need more than a one-row check go through `SECURITY DEFINER` functions such as `create_post`, `report_content` and `start_direct_conversation`, which check permissions, limits and blocks themselves. Rate limits (posts, messages, reports, listings, message requests) are enforced in the database, so they hold for every client.

### Rules every feature keeps

- **Nothing new is public before review when it needs to be.** Posts, events and opportunities from members without a good reputation (a member for an hour, something approved before, nothing reported recently) wait for a moderator. Authors see their own pending items. Three reports from different people hold a post for review. Admins can turn premoderation off.
- **Posts are immutable.** Create and delete, never edit. Deleting blanks a post at once and keeps its content privately for 30 seconds so Undo works; then it is erased and an authorless tombstone keeps other people's replies in their thread.
- **Mutes and blocks apply everywhere**: feeds, threads, search, suggestions, notifications and messages. A muted person's profile can still be visited; a blocked one is unavailable in both directions.
- **Store as little as possible.** Settings are private to their owner. Location is a city, never coordinates. Photos are re-encoded in the browser, which strips EXIF and location data. Deleting an account erases the profile, posts, likes, messages sent, settings and uploaded files. The JSON export includes everything stored about the person.

### App structure

```
src/
  app/(app)/        pages inside the three-column shell
  app/(auth)/       sign in, sign up, password reset
  app/onboarding/   first-time setup
  app/actions/      server actions; each returns Result<T>
  app/api/          translate, export, maintenance
  components/       ui, shell, people, post, messages, community, settings, moderation
  lib/domain.ts     zod schemas that turn database rows into domain types
  lib/data/         server-only loaders
  lib/feeds.ts      every list of posts is a FeedSource
```

`PRODUCT.md` and `DESIGN.md` describe the product rules and design system, `PRODUCT_METRICS.md` what `/operations` measures and why, and `AGENTS.md` the engineering guidelines. The logo files on `/brand` are drawn from `src/lib/brand-mark.ts` by `pnpm brand`.

Rows from Supabase are parsed once in `lib/domain.ts` or a loader, into discriminated unions (a `PostRow` is a `post` or a `tombstone`; a quoted post is a `post`, `deleted` or `unavailable`). Components trust those types.

## Checks

```bash
pnpm check
```

This runs the type checker, ESLint, the unit tests (`pnpm test`) and the database tests (`pnpm test:db`). The database tests apply every migration to an embedded Postgres with stand-ins for Supabase's `auth` and `storage` schemas, then exercise the policies, triggers and functions as different members: premoderation, blocking, message requests, organisations, reports, undo, export and account deletion. CI runs the same checks and a production build on every push.

## Maintenance

- Scheduled posts are published and deleted posts are purged every minute by `pg_cron`. Without it, call `POST /api/maintenance` with `Authorization: Bearer $MAINTENANCE_SECRET` on a schedule, for example a Vercel cron. That endpoint also removes erased images from Storage, which a database function cannot do.
- Accounts deactivated for being under 16 are deleted after 30 days unless a moderator reinstates them, daily by `pg_cron` or by `/api/maintenance`. See `docs/AGE_ASSURANCE.md` and `docs/ONLINE_SAFETY.md` for what the online safety law asks of Mavuno and how it is reviewed.
- Translations are cached for seven days.
- Admins see product metrics, the day's activity, optional traffic and whether background jobs are keeping up (pg_cron runs included) at `/operations`.

## Known limits

- Message bodies are protected by row level security but not encrypted at rest beyond Supabase's disk encryption.
- Post language is chosen by the author in the composer rather than detected.
- The privacy policy and terms are plain-language starting points. Have them reviewed before launch.
