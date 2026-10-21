"use client";

import { errorDigest } from "@/lib/error-text";
import "./globals.css";

// Shown when the root layout itself fails, so it brings its own document and
// styles. The digest is the same one recorded in server_errors, so a person
// can quote it and an admin can find it on the Health tab.
export default function GlobalError({ error, retry }: { error: unknown; retry: () => void }) {
  const digest = errorDigest(error);
  return (
    <html lang="en-AU">
      <head>
        <title>Something went wrong · Mavuno</title>
      </head>
      <body className="min-h-dvh font-sans antialiased">
        <main className="flex min-h-dvh flex-col items-center justify-center gap-6 px-6 text-center">
          <p className="text-xl font-bold tracking-tight">mavuno</p>
          <div className="grid max-w-sm gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">Something went wrong</h1>
            <p className="text-[15px] text-ink-muted">It's on our side. Try again in a moment, or go back to the home page.</p>
            {digest ? <p className="font-mono text-xs text-ink-muted">Reference {digest}</p> : null}
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={retry} className="inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-ink hover:bg-primary-hover">
              Try again
            </button>
            {/* A plain link, so going home is a full load: the app itself is what failed. */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a href="/" className="inline-flex h-9 items-center rounded-md border border-rail bg-shell px-4 text-sm font-medium hover:bg-wash">
              Go home
            </a>
          </div>
        </main>
      </body>
    </html>
  );
}
