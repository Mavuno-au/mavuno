// Pushes the migrations over a direct Postgres connection taken from
// SUPABASE_DB_URL in .env.local, so the password is never typed or kept in shell history.
//
//   pnpm db:push            apply pending migrations
//   pnpm db:push --dry-run  list what would be applied

import { execFileSync } from "node:child_process";

const url = process.env.SUPABASE_DB_URL;
if (!url) {
  console.error("Add SUPABASE_DB_URL to .env.local (Project Settings → Database → Connection string).");
  process.exit(1);
}

// Anything else the CLI takes, such as --include-seed, could put the demo accounts into production.
const flags = process.argv.slice(2);
if (flags.some((flag) => flag !== "--dry-run")) {
  console.error("db:push takes only --dry-run.");
  process.exit(1);
}

console.log(`Pushing to ${new URL(url).hostname}`);
try {
  execFileSync("supabase", ["db", "push", "--db-url", url, ...flags], { stdio: "inherit" });
} catch (error) {
  // The CLI has printed its own error; Node's would repeat the command, password and all.
  process.exit(typeof error.status === "number" ? error.status : 1);
}
