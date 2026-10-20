<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Working on Mavuno

Read `PRODUCT.md` (what Mavuno is and the rules every feature keeps), `DESIGN.md` (tokens and components) and `README.md` (setup and architecture) first.

## Where things go

- `supabase/migrations/` is the source of truth for data and permissions. Add a migration with `pnpm supabase migration new <name>`; never edit one that has been pushed. Every table has row level security, and new tables and functions need explicit grants (see `20261020000010_api_grants.sql`).
- `src/lib/domain.ts` and `src/lib/data/*` parse database rows with zod into domain types. Components and actions trust those types.
- `src/app/actions/*` are server actions. They parse their input and return `Result` from `src/lib/result.ts`.
- `src/components/ui` holds primitives, `shell` the app frame, `people`, `post`, `messages`, `community`, `settings` and `moderation` their features.

## Rules

- Parse at boundaries (forms, action arguments, rows, URLs); trust types inside.
- Model variants as discriminated unions with `kind`; switch exhaustively.
- No `as` casts (except `as const`), no `any`, no non-null `!`, no `console` in app code.
- Comments explain why, never what.
- Prefer deleting code to adding it.

## Checks

Run `pnpm check` (types, lint, unit tests, database tests) before finishing, and `pnpm build` for anything touching routes. After a migration, run the database advisors (see README).
