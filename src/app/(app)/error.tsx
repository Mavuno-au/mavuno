"use client";

import { Button } from "@/components/ui/button";
import { EmptyState, PageHeader } from "@/components/ui/page";

// Keeps the navigation on screen when something inside a page fails.
export default function AppError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <>
      <PageHeader title="Something went wrong" />
      <EmptyState title="This page didn't load" action={<Button onClick={reset}>Try again</Button>}>
        It's on our side. Try again, or go somewhere else from the menu.
      </EmptyState>
    </>
  );
}
