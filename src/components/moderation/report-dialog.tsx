"use client";

import Link from "next/link";
import { useId, useState, useTransition } from "react";
import { reportContent, type Report } from "@/app/actions/social";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { FormError, Input, Textarea } from "@/components/ui/field";
import { Note } from "@/components/ui/prose";
import { LIMITS, REPORT_REASONS, type ReportReason } from "@/lib/catalogue";
import { reach } from "@/lib/version";

type Target = Pick<Report, "targetType" | "targetId">;

const ESAFETY_REPORT = "https://www.esafety.gov.au/report";

function ESafetyLink({ children }: { children: string }) {
  return (
    <a href={ESAFETY_REPORT} target="_blank" rel="noopener noreferrer" className="font-medium text-primary hover:underline">
      {children}
    </a>
  );
}

// eSafety can act on intimate images straight away, without waiting for us.
function IntimateImagesNote() {
  return (
    <Note>
      <span className="text-sm">
        Report it to <ESafetyLink>eSafety</ESafetyLink> straight away as well. They can help get intimate images removed, here and on other sites, and you don't have to wait for us.
      </span>
    </Note>
  );
}

// What happens next, and where to go if we don't act: Online Safety Act
// complaints go to eSafety when a service hasn't dealt with them in 48 hours.
function Sent({ reason }: { reason: ReportReason }) {
  return (
    <div className="grid gap-3 text-[15px]">
      <p>Thanks. A moderator will review it. The person won't know who reported them.</p>
      {reason === "legal" ? <p>We'll look at your complaint and, where it's appropriate, act within 7 days. We'll contact you if we need more details.</p> : null}
      {reason === "intimate_images" ? (
        <IntimateImagesNote />
      ) : (
        <p className="text-sm text-ink-muted">
          If this is serious online abuse and we haven't dealt with it within 48 hours, you can report it to <ESafetyLink>eSafety</ESafetyLink>.
        </p>
      )}
      <p className="text-sm text-ink-muted">If someone is in danger right now, call 000.</p>
    </div>
  );
}

export function ReportDialog({ target, onClose, what }: { target: Target | null; onClose: () => void; what: string }) {
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState("");
  const [contact, setContact] = useState("");
  const [sent, setSent] = useState<ReportReason | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const contactId = useId();
  const legal = reason === "legal";

  function close() {
    setReason(null);
    setDetails("");
    setContact("");
    setSent(null);
    setError(null);
    onClose();
  }

  function submit() {
    if (!target || !reason) return;
    startTransition(async () => {
      const result = await reach(reportContent({ ...target, reason, details, contact: legal ? contact : undefined }));
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setError(null);
      setSent(reason);
    });
  }

  return (
    <Dialog
      open={target !== null}
      onClose={close}
      title={sent ? "Report sent" : `Report this ${what}`}
      footer={
        sent ? (
          <Button onClick={close} className="min-w-24">
            Done
          </Button>
        ) : (
          <>
            <Button variant="ghost" onClick={close}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={!reason || pending || (legal && (!details.trim() || !contact.trim()))} className="min-w-24">
              {pending ? "Sending…" : "Report"}
            </Button>
          </>
        )
      }
    >
      {sent ? (
        <Sent reason={sent} />
      ) : (
        <>
          <fieldset className="grid gap-1">
            <legend className="mb-2 text-sm text-ink-muted">
              What's wrong? See the <Link href="/rules" className="text-primary hover:underline">community rules</Link>.
            </legend>
            {REPORT_REASONS.map(({ value, label }) => (
              <label key={value} className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 hover:bg-wash">
                <input type="radio" name="reason" value={value} checked={reason === value} onChange={() => setReason(value)} className="accent-(--primary)" />
                <span className="text-[15px]">{label}</span>
              </label>
            ))}
          </fieldset>
          {reason === "intimate_images" ? (
            <div className="mt-3">
              <IntimateImagesNote />
            </div>
          ) : null}
          <Textarea
            className="mt-3"
            aria-label={legal ? "What's wrong with it" : "Anything else a moderator should know"}
            placeholder={legal ? "What's wrong with it and why, for example what is untrue and how it harms you (required)" : "Anything else a moderator should know (optional)"}
            maxLength={LIMITS.reportDetails}
            value={details}
            onChange={(event) => setDetails(event.target.value)}
          />
          {legal ? (
            <div className="mt-3 grid gap-1.5">
              <label htmlFor={contactId} className="text-sm font-medium">
                How can we contact you?
              </label>
              <Input id={contactId} value={contact} maxLength={200} placeholder="Your name and email or phone" onChange={(event) => setContact(event.target.value)} />
              <p className="text-sm text-ink-muted">
                Only moderators see this. We may tell the person who posted it about the complaint, but not how to reach you. For a longer complaint, email us as the{" "}
                <Link href="/terms#complaints" className="text-primary hover:underline">terms</Link> explain.
              </p>
            </div>
          ) : null}
          <FormError message={error} />
        </>
      )}
    </Dialog>
  );
}
