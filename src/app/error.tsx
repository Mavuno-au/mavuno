"use client";

import { Wordmark } from "@/components/shell/brand";
import { Button } from "@/components/ui/button";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 px-6 text-center">
      <Wordmark />
      <div className="grid max-w-sm gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Something went wrong</h1>
        <p className="text-[15px] text-ink-muted">It's on our side. Try again in a moment.</p>
      </div>
      <Button onClick={reset}>Try again</Button>
    </main>
  );
}
