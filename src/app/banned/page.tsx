import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { signOut } from "@/app/actions/auth";
import { Wordmark } from "@/components/shell/brand";
import { Button } from "@/components/ui/button";
import { loadBanNotice } from "@/lib/data/moderation";
import { calendarDate } from "@/lib/format";
import { APPEAL_DAYS, appealDeadline, appealIsOpen, ruleOf } from "@/lib/rules";
import { CONTACT_EMAIL } from "@/lib/site";
import { requireViewer } from "@/lib/viewer";

export const metadata: Metadata = { title: "Account banned", robots: { index: false } };

// Banned members can read the decision, appeal it, download their
// information and delete the account. Nothing else.
export default async function BannedPage() {
  const viewer = await requireViewer("/banned");
  if (!viewer.banned) redirect("/");
  const notice = await loadBanNotice(viewer.id);
  const rule = notice?.rule ? ruleOf(notice.rule) : null;
  const subject = encodeURIComponent(`Appeal: ban of @${viewer.username}`);

  return (
    <div className="min-h-dvh bg-shell">
      <header className="mx-auto flex max-w-2xl items-center px-4 py-4">
        <Wordmark />
      </header>
      <main className="mx-auto max-w-2xl px-4 pb-16">
        <div className="grid gap-5 rounded-xl border border-hairline bg-surface px-4 py-6 text-[15px] sm:px-8 sm:py-8">
          <h1 className="text-2xl font-semibold tracking-tight">Your account is banned</h1>
          <p>{notice?.message ?? "Your account is banned from Mavuno for breaking the community rules."}</p>
          <p>
            You can't post, reply, message, like or follow, and what you posted is hidden.
            {rule ? (
              <>
                {" "}
                The decision was made under{" "}
                <Link href={rule.href} className="text-primary hover:underline">
                  {rule.label}
                </Link>
                .
              </>
            ) : null}
          </p>

          <section className="grid gap-2">
            <h2 className="font-semibold">If we got this wrong</h2>
            {notice && appealIsOpen(notice.created_at) ? (
              <p>
                Email{" "}
                <a href={`mailto:${CONTACT_EMAIL}?subject=${subject}`} className="text-primary hover:underline">
                  {CONTACT_EMAIL}
                </a>{" "}
                by <strong>{calendarDate(appealDeadline(notice.created_at))}</strong>, {APPEAL_DAYS} days after the notice, with your username, @{viewer.username}, and why you think it was a mistake. A
                different moderator from the one who decided looks at it again, and we aim to reply within 7 days. If we got it wrong, your account and your posts come back.
              </p>
            ) : (
              <p>
                Email{" "}
                <a href={`mailto:${CONTACT_EMAIL}?subject=${subject}`} className="text-primary hover:underline">
                  {CONTACT_EMAIL}
                </a>{" "}
                with your username, @{viewer.username}, and why you think it was a mistake.
              </p>
            )}
          </section>

          <section className="grid gap-2">
            <h2 className="font-semibold">Your information</h2>
            <p>
              <a href="/api/export" className="text-primary hover:underline">
                Download your data
              </a>{" "}
              to keep a copy of your posts and messages, or{" "}
              <Link href="/settings/account" className="text-primary hover:underline">
                delete your account
              </Link>
              . A ban outlives the account: we keep a scrambled form of your email address and sign-in, and nothing else, so it can't be used to join again. The{" "}
              <Link href="/privacy" className="text-primary hover:underline">
                privacy policy
              </Link>{" "}
              explains.
            </p>
          </section>

          <p className="text-sm text-ink-muted">
            How bans and appeals work is explained in <Link href="/help/bans" className="text-primary hover:underline">Help</Link>.
          </p>
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
