"use client";

import { Button } from "@/components/ui/button";
import { EmptyState, PageHeader } from "@/components/ui/page";
import { errorDigest } from "@/lib/error-text";

// Keeps the navigation on screen when something inside a page fails. retry
// fetches the page again; reset would only re-render the same failed answer.
export default function AppError({ error, retry }: { error: unknown; retry: () => void }) {
  const digest = errorDigest(error);
  return (
    <>
      <PageHeader title="Something went wrong" />
      <EmptyState title="This page didn't load" action={<Button onClick={retry}>Try again</Button>}>
        It's on our side. Try again, or go somewhere else from the menu.
        {digest ? <span className="mt-2 block font-mono text-xs">Reference {digest}</span> : null}
      </EmptyState>
    </>
  );
}
