"use client";

import { Search } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { ban, liftSuspension, restoreDecision, suspend } from "@/app/actions/moderation";
import { Author } from "@/components/moderation/author";
import { ReasonField } from "@/components/moderation/reason-field";
import { RuleSelect } from "@/components/moderation/rule-select";
import { SettingsGroup } from "@/components/settings/layout";
import { useSave } from "@/components/settings/use-save";
import { useViewer } from "@/components/shell/viewer-context";
import { Button } from "@/components/ui/button";
import { FormError, Input, Select } from "@/components/ui/field";
import { LocalTime } from "@/components/ui/local-time";
import { Chip, EmptyState } from "@/components/ui/page";
import type { Decision, PersonHistory, Sanction, SanctionStatus } from "@/lib/data/moderation";
import { count } from "@/lib/format";
import { ruleOf, SUSPENSION_LENGTHS, type BreakableRule, type SuspensionLength } from "@/lib/rules";

const ACTIONS: Record<string, string> = {
  approve: "Approved",
  reject: "Removed",
  dismiss: "Reports dismissed",
  suspend: "Suspended",
  unsuspend: "Suspension lifted",
  ban: "Banned",
  unban: "Ban lifted",
  restore: "Restored after appeal",
  deactivate: "Deactivated as under 16",
  reinstate: "Reinstated after an age review",
  verify: "Verified",
  unverify: "Verification removed",
};

const actionLabel = (action: string) => ACTIONS[action] ?? (action.startsWith("role:") ? `Made ${action.slice(5)}` : action);

function StatusChip({ status }: { status: SanctionStatus }) {
  switch (status.kind) {
    case "none":
      return <Chip>In good standing</Chip>;
    case "suspended":
      return (
        <Chip tone="warning">
          Suspended until <LocalTime iso={status.until} format="full" />
        </Chip>
      );
    case "banned":
      return (
        <Chip tone="danger">
          Banned <LocalTime iso={status.since} />
        </Chip>
      );
    default: {
      const exhaustive: never = status;
      return exhaustive;
    }
  }
}

function LiftButton({ status, profileId, onDone }: { status: SanctionStatus; profileId: string; onDone?: () => void }) {
  const viewer = useViewer();
  const { pending, error, save } = useSave();
  if (status.kind === "none") return null;
  const canLift = status.kind === "suspended" || viewer?.role === "admin";
  return (
    <span className="inline-flex flex-col items-end gap-1">
      <Button size="sm" variant="outline" disabled={pending || !canLift} title={canLift ? undefined : "Only admins lift bans"} onClick={() => save(() => liftSuspension({ profileId }), status.kind === "banned" ? "Ban lifted" : "Suspension lifted", onDone)}>
        {status.kind === "banned" ? "Lift ban" : "Lift suspension"}
      </Button>
      <FormError message={error} />
    </span>
  );
}

function DecisionLine({ decision, withSubject = false }: { decision: Decision; withSubject?: boolean }) {
  return (
    <span className="min-w-0">
      <span className="font-mono text-xs text-ink-muted">#{decision.id}</span> {actionLabel(decision.action)}
      {decision.action === "reject" || decision.action === "restore" || decision.action === "approve" ? <span className="text-ink-muted"> ({decision.targetType})</span> : null}
      {withSubject && decision.subject ? (
        <>
          {" "}
          <Link href={`/moderation/people?q=${decision.subject.username}`} className="font-mono text-xs text-primary hover:underline">
            @{decision.subject.username}
          </Link>
        </>
      ) : null}
      {decision.rule ? <span className="text-ink-muted">, {ruleOf(decision.rule).short}</span> : null}
      {decision.reason ? <span className="block text-ink-muted">{decision.reason}</span> : null}
      <span className="block font-mono text-xs text-ink-muted">
        <LocalTime iso={decision.createdAt} /> · by {decision.moderator ? `@${decision.moderator.username}` : "a former moderator"}
      </span>
    </span>
  );
}

function RestoreButton({ decision }: { decision: Decision }) {
  const [reason, setReason] = useState("");
  const [done, setDone] = useState(false);
  const { pending, error, save } = useSave();
  if (!decision.restorable) return <p className="text-sm text-ink-muted">Nothing to restore: removed messages are wiped and removed spaces deleted, and other decisions removed nothing.</p>;
  if (done) return <Chip tone="primary">Restored</Chip>;
  const what = decision.action === "reject" ? `Restore the ${decision.targetType}` : decision.action === "ban" ? "Lift the ban" : "Lift the suspension";
  return (
    <div className="grid gap-2">
      <ReasonField value={reason} onChange={setReason} disabled={pending} />
      <div>
        <Button size="sm" disabled={pending} onClick={() => save(() => restoreDecision({ decision: decision.id, reason }), "Done. The person has been told.", () => setDone(true))}>
          {what} after the appeal
        </Button>
      </div>
      <FormError message={error} />
    </div>
  );
}

function SanctionForm() {
  const [username, setUsername] = useState("");
  const [length, setLength] = useState<SuspensionLength>("1 day");
  const [rule, setRule] = useState<BreakableRule | null>(null);
  const [reason, setReason] = useState("");
  const { pending, error, save } = useSave();
  const handle = username.trim().replace(/^@/, "");
  return (
    <SettingsGroup
      title="Suspend or ban someone"
      hint="Without waiting for a report. A suspension stops posting, liking, following and messaging until it ends, and a second one adds to the first. A ban never ends and keeps a hash of the email address and sign-in, so the person can't sign up again. Both tell the person the rule, your reason and how to appeal."
    >
      <form
        className="grid gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          save(() => suspend({ username: handle, length, reason, rule }), `@${handle} is suspended for ${length}`, () => setUsername(""));
        }}
      >
        <div className="flex flex-wrap items-center gap-2">
          <Input aria-label="Username" value={username} onChange={(event) => setUsername(event.target.value)} placeholder="@username" required autoCapitalize="none" className="min-w-0 flex-1 font-mono" />
          <Select aria-label="For how long" value={length} onChange={(event) => setLength(SUSPENSION_LENGTHS.find((option) => option.value === event.target.value)?.value ?? "1 day")} className="w-28">
            {SUSPENSION_LENGTHS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
          <RuleSelect value={rule} onChange={setRule} disabled={pending} />
        </div>
        <ReasonField value={reason} onChange={setReason} disabled={pending} />
        <div className="flex flex-wrap gap-2">
          <Button type="submit" variant="outline" disabled={pending || handle === ""} className="min-w-28">
            {pending ? "Saving…" : "Suspend"}
          </Button>
          <Button type="button" variant="destructive" disabled={pending || handle === ""} onClick={() => save(() => ban({ username: handle, reason, rule }), `@${handle} is banned`, () => setUsername(""))}>
            Ban
          </Button>
        </div>
        <FormError message={error} />
      </form>
    </SettingsGroup>
  );
}

function SanctionRow({ sanction, onDone }: { sanction: Sanction; onDone: () => void }) {
  return (
    <li className="border-b border-hairline px-4 py-3 sm:px-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <Author
          profile={sanction.profile}
          meta={
            <Link href={`/moderation/people?q=${sanction.profile.username}`} className="hover:underline">
              {count(sanction.suspensions, "suspension")} so far
            </Link>
          }
        />
        <div className="flex flex-wrap items-center justify-end gap-2">
          <StatusChip status={sanction.status} />
          <LiftButton status={sanction.status} profileId={sanction.profile.id} onDone={onDone} />
        </div>
      </div>
      {sanction.latest ? (
        <p className="mt-2 text-sm">
          <DecisionLine decision={sanction.latest} />
        </p>
      ) : null}
    </li>
  );
}

export function LookupForm({ query }: { query: string }) {
  return (
    <form method="get" action="/moderation/people" className="flex flex-wrap items-center gap-2 border-b border-hairline px-4 py-3 sm:px-6">
      <Input name="q" aria-label="Username or decision number" defaultValue={query} placeholder="@username, or a decision number from an appeal" autoCapitalize="none" className="min-w-0 flex-1" />
      <Button type="submit" variant="outline" size="sm">
        <Search />
        Look up
      </Button>
    </form>
  );
}

export function DecisionCard({ decision }: { decision: Decision | null }) {
  if (!decision) return <EmptyState title="No such decision">Appeal emails name the decision by its number. Check the number and try again.</EmptyState>;
  return (
    <section className="border-b border-hairline px-4 py-4 sm:px-6">
      <h2 className="text-sm font-medium text-ink-muted">Decision #{decision.id}</h2>
      <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
        <Author profile={decision.subject} />
        <p className="text-sm">
          <DecisionLine decision={decision} />
        </p>
      </div>
      <div className="mt-3">
        <RestoreButton decision={decision} />
      </div>
    </section>
  );
}

export function PersonCard({ history, query }: { history: PersonHistory | null; query: string }) {
  if (!history) return <EmptyState title={`Nobody called @${query}`}>Check the username and try again.</EmptyState>;
  return (
    <section className="border-b border-hairline px-4 py-4 sm:px-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <Author profile={history.profile} />
        <div className="flex flex-wrap items-center justify-end gap-2">
          <StatusChip status={history.status} />
          <LiftButton status={history.status} profileId={history.profile.id} />
        </div>
      </div>
      <h3 className="mt-4 text-sm font-medium text-ink-muted">Past decisions</h3>
      {history.decisions.length === 0 ? (
        <p className="mt-1 text-sm text-ink-muted">None.</p>
      ) : (
        <ul className="mt-1 grid gap-2 text-sm">
          {history.decisions.map((decision) => (
            <li key={decision.id}>
              <DecisionLine decision={decision} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function SanctionList({ sanctions, hashes }: { sanctions: Sanction[]; hashes: number }) {
  const [done, setDone] = useState<ReadonlySet<string>>(new Set());
  const visible = sanctions.filter((sanction) => !done.has(sanction.profile.id));
  return (
    <>
      <SanctionForm />
      <section>
        <h2 className="px-4 pt-6 pb-2 text-sm font-medium text-ink-muted sm:px-6">Suspended or banned now</h2>
        {visible.length === 0 ? (
          <EmptyState title="Nobody is suspended">People under a suspension or a ban show up here, newest first, with the decision that did it.</EmptyState>
        ) : (
          <ul>
            {visible.map((sanction) => (
              <SanctionRow key={sanction.profile.id} sanction={sanction} onDone={() => setDone((current) => new Set(current).add(sanction.profile.id))} />
            ))}
          </ul>
        )}
        <p className="px-4 py-4 text-sm text-ink-muted sm:px-6">
          {hashes === 0 ? "No sign-in hashes are kept from bans or deleted suspended accounts." : `${count(hashes, "sign-in hash", "sign-in hashes")} from bans and deleted suspended accounts stop those people signing up again.`}
        </p>
      </section>
    </>
  );
}
