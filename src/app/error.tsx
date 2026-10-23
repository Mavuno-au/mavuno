"use client";

import { Wordmark } from "@/components/shell/brand";
import { Button } from "@/components/ui/button";
import { errorDigest } from "@/lib/error-text";

export default function ErrorPage({ error, retry }: { error: unknown; retry: () => void }) {
  const digest = errorDigest(error);
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 px-6 text-center">
      <Wordmark />
      <div className="grid max-w-sm gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Something went wrong</h1>
        <p className="text-[15px] text-ink-muted">It's on our side. Try again in a moment.</p>
        {digest ? <p className="font-mono text-xs text-ink-muted">Reference {digest}</p> : null}
      </div>
      <Button onClick={retry}>Try again</Button>
    </main>
  );
}
