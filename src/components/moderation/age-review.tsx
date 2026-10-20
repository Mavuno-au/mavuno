"use client";

import { useState } from "react";
import { deactivateUnder16, reinstateAge } from "@/app/actions/moderation";
import { Author } from "@/components/moderation/author";
import { SettingsGroup } from "@/components/settings/layout";
import { useSave } from "@/components/settings/use-save";
import { Button } from "@/components/ui/button";
import { FormError, Input, Select } from "@/components/ui/field";
import { LocalTime } from "@/components/ui/local-time";
import { EmptyState } from "@/components/ui/page";
import type { AgeBasis, AgeCheck, AgeStep, DeactivatedAccount } from "@/lib/data/age";
import { calendarDate } from "@/lib/format";

const SUSPICIONS = [
  { value: "report", label: "Members reported it" },
  { value: "posts", label: "What they posted" },
  { value: "profile", label: "Their profile" },
  { value: "other", label: "Something else" },
] as const;

const EVIDENCE = [
  { value: "video_call", label: "A video call" },
  { value: "document", label: "A letter or document" },
  { value: "other", label: "Something else" },
] as const;

const STEPS: Record<AgeStep, string> = {
  declared_under_16: "Said they were under 16",
  flagged: "Deactivated by a moderator",
  reinstated: "Reinstated after review",
  deleted: "Deleted after 30 days",
};

const BASES: Record<AgeBasis, string> = {
  self_declared: "their own answer",
  report: "reports",
  posts: "their posts",
  profile: "their profile",
  document: "a letter or document",
  video_call: "a video call",
  other: "something else",
};

function DeactivateForm() {
  const [username, setUsername] = useState("");
  const [basis, setBasis] = useState<(typeof SUSPICIONS)[number]["value"]>("report");
  const { pending, error, save } = useSave();
  const handle = username.trim().replace(/^@/, "");
  return (
    <SettingsGroup
      title="Deactivate an account"
      hint="When you believe an account belongs to someone under 16. They're told why, their posts are hidden, and they can ask for a review by email. Unless reinstated, the account is deleted after 30 days."
    >
      <form
        className="grid gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          save(() => deactivateUnder16({ username: handle, basis }), `@${handle} is deactivated`, () => setUsername(""));
        }}
      >
        <div className="flex flex-wrap gap-2">
          <Input aria-label="Username" value={username} onChange={(event) => setUsername(event.target.value)} placeholder="@username" required autoCapitalize="none" className="min-w-0 flex-1 font-mono" />
          <Select aria-label="Why you believe they're under 16" value={basis} onChange={(event) => setBasis(SUSPICIONS.find((option) => option.value === event.target.value)?.value ?? "other")} className="w-48">
            {SUSPICIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
          <Button type="submit" variant="destructive" disabled={pending} className="min-w-28">
            {pending ? "Saving…" : "Deactivate"}
          </Button>
        </div>
        <FormError message={error} />
      </form>
    </SettingsGroup>
  );
}

function DeactivatedRow({ account, onDone }: { account: DeactivatedAccount; onDone: () => void }) {
  const [basis, setBasis] = useState<(typeof EVIDENCE)[number]["value"]>("video_call");
  const { pending, error, save } = useSave();
  return (
    <li className="border-b border-hairline px-4 py-3 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Author profile={account.profile} meta={`deleted on ${calendarDate(account.deletesAt)}`} />
        <div className="flex flex-wrap items-center gap-2">
          <Select aria-label="How they showed they're 16 or older" value={basis} onChange={(event) => setBasis(EVIDENCE.find((option) => option.value === event.target.value)?.value ?? "other")} className="h-8 w-auto text-sm">
            {EVIDENCE.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
          <Button size="sm" variant="outline" disabled={pending} onClick={() => save(() => reinstateAge({ profileId: account.profile.id, basis }), `@${account.profile.username} is reinstated`, onDone)}>
            Reinstate
          </Button>
        </div>
      </div>
      <FormError message={error} />
    </li>
  );
}

export function AgeReview({ deactivated, record }: { deactivated: DeactivatedAccount[]; record: AgeCheck[] }) {
  const [done, setDone] = useState<ReadonlySet<string>>(new Set());
  const waiting = deactivated.filter((account) => !done.has(account.profile.id));
  return (
    <>
      <p className="border-b border-hairline px-4 py-3 text-sm text-ink-muted sm:px-6">
        Members confirm they're 16 or older with a date of birth we don't keep. Reviews happen by email: offer a video call or a letter, and never insist on government ID. Delete what they send
        once you've decided, and record only how they showed it. See docs/AGE_ASSURANCE.md.
      </p>
      <DeactivateForm />
      <section>
        <h2 className="px-4 pt-6 pb-2 text-sm font-medium text-ink-muted sm:px-6">Waiting for a review</h2>
        {waiting.length === 0 ? (
          <EmptyState title="No deactivated accounts">Accounts deactivated for being under 16 wait here for 30 days, in case they ask for a review.</EmptyState>
        ) : (
          <ul>
            {waiting.map((account) => (
              <DeactivatedRow key={account.profile.id} account={account} onDone={() => setDone((current) => new Set(current).add(account.profile.id))} />
            ))}
          </ul>
        )}
      </section>
      <section>
        <h2 className="px-4 pt-6 pb-2 text-sm font-medium text-ink-muted sm:px-6">Record of age checks</h2>
        {record.length === 0 ? (
          <p className="px-4 pb-6 text-sm text-ink-muted sm:px-6">Nothing yet.</p>
        ) : (
          <ul className="pb-6">
            {record.map((check) => (
              <li key={check.id} className="flex flex-wrap items-baseline justify-between gap-x-3 px-4 py-1.5 text-sm sm:px-6">
                <span>
                  {STEPS[check.step]}
                  {check.basis ? <span className="text-ink-muted">, based on {BASES[check.basis]}</span> : null}
                  {check.profile ? <span className="font-mono text-xs text-ink-muted"> · @{check.profile.username}</span> : null}
                </span>
                <span className="font-mono text-xs text-ink-muted">
                  <LocalTime iso={check.createdAt} />
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
