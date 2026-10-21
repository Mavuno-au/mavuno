import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { signOut } from "@/app/actions/auth";
import { Under16Support } from "@/components/age/birth-date-fields";
import { Wordmark } from "@/components/shell/brand";
import { Button } from "@/components/ui/button";
import { loadAgeNotice } from "@/lib/data/age";
import { calendarDate } from "@/lib/format";
import { CONTACT_EMAIL } from "@/lib/site";
import { requireViewer } from "@/lib/viewer";

export const metadata: Metadata = { title: "Account deactivated", robots: { index: false } };

export default async function DeactivatedPage() {
  const viewer = await requireViewer("/deactivated");
  if (viewer.age.kind !== "deactivated") redirect("/");
  const notice = await loadAgeNotice(viewer.id);
  const deletesOn = calendarDate(viewer.age.deletesAt);
  const subject = encodeURIComponent(`Age review for @${viewer.username}`);

  return (
    <div className="min-h-dvh bg-shell">
      <header className="mx-auto flex max-w-2xl items-center px-4 py-4">
        <Wordmark />
      </header>
      <main className="mx-auto max-w-2xl px-4 pb-16">
        <div className="grid gap-5 rounded-xl border border-hairline bg-surface px-4 py-6 text-[15px] sm:px-8 sm:py-8">
          <h1 className="text-2xl font-semibold tracking-tight">Your account is deactivated</h1>
          <p>{notice ?? "Your account is deactivated because we believe you're under 16. Australian law doesn't allow people under 16 to have social media accounts."}</p>
          <p>
            You can't post, reply, message or follow, and your posts are hidden. On <strong>{deletesOn}</strong> your account and everything in it will be deleted, unless a review finds you're
            16 or older.
          </p>

          <section className="grid gap-2">
            <h2 className="font-semibold">If we got this wrong</h2>
            <p>
              Email <a href={`mailto:${CONTACT_EMAIL}?subject=${subject}`} className="text-primary hover:underline">{CONTACT_EMAIL}</a> before {deletesOn} with your username, @{viewer.username}. A
              moderator will reply and ask you to show you're 16 or older in one of these ways. You choose:
            </p>
            <ul className="list-disc space-y-1 pl-5">
              <li>a short video call with one of our team, which we don't record</li>
              <li>a letter or email from your school, TAFE, university or employer saying you're 16 or older</li>
              <li>ID, such as a licence or passport, only if you'd prefer that. We never require government ID.</li>
            </ul>
            <p className="text-ink-muted">
              We use what you show us only to check your age. Once we've checked, we delete it and keep only the result. If you're 16 or older, we'll turn your account back on and your
              posts will come back.
            </p>
          </section>

          <section className="grid gap-2">
            <h2 className="font-semibold">Your information</h2>
            <p>
              <a href="/api/export" className="text-primary hover:underline">Download your data</a> to keep a copy of your posts and messages, or{" "}
              <Link href="/settings/account" className="text-primary hover:underline">delete your account now</Link>.
            </p>
          </section>

          <p className="text-sm text-ink-muted">
            How the age check works is explained in <Link href="/help/age-check" className="text-primary hover:underline">Help</Link>.
          </p>
          <Under16Support />

          <form action={signOut}>
            <Button type="submit" variant="outline">
              Sign out
            </Button>
          </form>
        </div>
      </main>
    </div>
  );
}
