import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Wordmark } from "@/components/shell/brand";
import { ageCheckPath, safeNext } from "@/lib/safe-redirect";
import { requireViewer } from "@/lib/viewer";
import { AgeForm } from "./age-form";

export const metadata: Metadata = { title: "Confirm your age", robots: { index: false } };

export default async function AgeCheckPage({ searchParams }: PageProps<"/onboarding/age">) {
  const next = safeNext((await searchParams).next);
  const viewer = await requireViewer(ageCheckPath(next));
  if (viewer.age.kind === "deactivated") redirect("/deactivated");
  if (viewer.age.kind === "confirmed") redirect(next);

  return (
    <div className="min-h-dvh bg-shell">
      <header className="mx-auto flex max-w-2xl items-center px-4 py-4">
        <Wordmark />
      </header>
      <main className="mx-auto max-w-2xl px-4 pb-16">
        <div className="grid gap-4 rounded-xl border border-hairline bg-surface px-4 py-6 sm:px-8 sm:py-8">
          <h1 className="text-2xl font-semibold tracking-tight">Confirm your age</h1>
          <p className="text-[15px] text-ink-muted">
            Australian law requires social media services to check that members are 16 or older, so we're asking everyone, including people who joined before. You only need to do this once.
          </p>
          <AgeForm next={next} />
          <p className="text-sm text-ink-muted">
            We keep only a note that you confirmed your age, and when. Read more in the <Link href="/privacy" className="text-primary hover:underline">privacy policy</Link>.
          </p>
        </div>
      </main>
    </div>
  );
}
