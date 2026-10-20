import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { buttonClass } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page";
import { Note, Prose } from "@/components/ui/prose";
import { loadModerationNotice, noticeIdSchema } from "@/lib/data/appeals";
import { publicEnv } from "@/lib/env";
import { calendarDate } from "@/lib/format";
import { APPEAL_DAYS, appealDeadline, appealIsOpen, ruleOf } from "@/lib/rules";
import { CONTACT_EMAIL } from "@/lib/site";
import { requireViewer } from "@/lib/viewer";

export const metadata: Metadata = { title: "Appeal a decision", robots: { index: false } };

export default async function AppealPage({ params }: PageProps<"/appeals/[id]">) {
  const { id } = await params;
  await requireViewer(`/appeals/${id}`);
  const noticeId = noticeIdSchema.safeParse(id);
  const notification = noticeId.success ? await loadModerationNotice(noticeId.data) : null;
  if (!notification) notFound();

  const rule = ruleOf(notification.notice.rule);
  const deadline = appealDeadline(notification.createdAt);
  const open = appealIsOpen(notification.createdAt);
  const reference = notification.notice.decision === null ? `notice ${notification.id}` : `decision ${notification.notice.decision}`;
  const subject = `Appeal: ${reference}`;
  const body = `Link to the notice: ${publicEnv.siteUrl}/appeals/${notification.id}\n\nWhy I think this was a mistake:\n\n`;
  const mailto = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

  return (
    <>
      <PageHeader title="Appeal a decision" back="/notifications" meta={`Notice of ${calendarDate(notification.createdAt)}`} />
      <Prose>
        <Note>{notification.message}</Note>
        <p>
          This decision was made under <Link href={rule.href}>{rule.label}</Link>. You can read the whole{" "}
          <Link href="/rules">community rules</Link> and <Link href="/terms">terms</Link> any time.
        </p>

        <h2>How to appeal</h2>
        {open ? (
          <>
            <p>
              If you think we got it wrong, email us by <strong>{calendarDate(deadline)}</strong>, {APPEAL_DAYS} days after the notice. Tell us why you think it was a mistake, and include the link to
              this page so we can find the decision.
            </p>
            <p>
              <a href={mailto} className={buttonClass({ variant: "primary" })}>
                Email your appeal
              </a>
            </p>
            <p className="text-ink-muted">Or write to {CONTACT_EMAIL} yourself, with "{subject}" as the subject.</p>
          </>
        ) : (
          <p>
            The {APPEAL_DAYS} days to appeal this decision ended on {calendarDate(deadline)}. If something stopped you appealing in time, email <a href={mailto}>{CONTACT_EMAIL}</a> and tell us what
            happened.
          </p>
        )}

        <h2>What happens next</h2>
        <ul>
          <li>A different moderator from the one who decided looks at it again.</li>
          <li>We aim to reply within 7 days.</li>
          <li>If we got it wrong, we restore what we removed or lift the suspension.</li>
        </ul>
      </Prose>
    </>
  );
}
