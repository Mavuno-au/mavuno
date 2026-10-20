// Pushes the migrations over a direct Postgres connection taken from
// SUPABASE_DB_URL in .env.local, so the password never appears in a command.
//
//   pnpm db:push            apply pending migrations
//   pnpm db:push --dry-run  list what would be applied

import { execFileSync } from "node:child_process";

const url = process.env.SUPABASE_DB_URL;
if (!url) {
  console.error("Add SUPABASE_DB_URL to .env.local (Project Settings → Database → Connection string).");
  process.exit(1);
}

execFileSync("supabase", ["db", "push", "--db-url", url, ...process.argv.slice(2)], { stdio: "inherit" });
