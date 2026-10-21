"use client";

import { BadgeCheck, ExternalLink, Scale, Trash2, UserX } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { ban, deactivateUnder16, dismissReports, moderate, suspend, verifyOrganisation } from "@/app/actions/moderation";
import { Author } from "@/components/moderation/author";
import { PostPreviewBlock } from "@/components/moderation/preview";
import { ReasonField } from "@/components/moderation/reason-field";
import { RuleSelect } from "@/components/moderation/rule-select";
import { useSave } from "@/components/settings/use-save";
import { Button } from "@/components/ui/button";
import { FormError } from "@/components/ui/field";
import { LocalTime, useNow } from "@/components/ui/local-time";
import { Menu } from "@/components/ui/menu";
import { Chip, EmptyState } from "@/components/ui/page";
import { languageName, reportReasonLabel } from "@/lib/catalogue";
import type { ReportGroup, ReportTarget } from "@/lib/data/moderation";
import { calendarDate, count } from "@/lib/format";
import { RULE_FOR_REASON, SUSPENSION_LENGTHS, type BreakableRule } from "@/lib/rules";

const TARGET_LABELS: Record<ReportTarget, string> = {
  post: "Post",
  profile: "Profile",
  message: "Message",
  event: "Event",
  opportunity: "Opportunity",
  space: "Space",
};

function ReportRow({ group, onDone }: { group: ReportGroup; onDone: () => void }) {
  const [reasonOpen, setReasonOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [rule, setRule] = useState<BreakableRule | null>(() => group.reasons.map((value) => RULE_FOR_REASON[value]).find((value) => value !== null) ?? null);
  const { pending, error, save } = useSave();
  const { profile, preview } = group;
  const now = useNow();
  const overdue = group.respondBy !== null && new Date(group.respondBy).getTime() < now;
  const held = preview?.post.status === "pending" ? preview.post.moderationNote : null;
  const content = group.targetType === "profile" ? null : { targetType: group.targetType, targetId: group.targetId };
  const canVerify = group.targetType === "profile" && profile?.accountType === "organisation" && !profile.verified;

  return (
    <article className="border-b border-hairline px-4 py-4 sm:px-6">
      <div className="flex items-start justify-between gap-3">
        <Author profile={profile} meta={<LocalTime iso={group.firstReportedAt} />} />
        <div className="flex shrink-0 items-center gap-1">
          <Chip>{TARGET_LABELS[group.targetType]}</Chip>
          {preview ? <Chip>{languageName(preview.post.language)}</Chip> : null}
          <Chip tone="danger">{count(group.count, "report")}</Chip>
          {group.standing < group.count ? (
            <span title="Only reports from members who have been around a week, with something published and in good standing, hold posts or put someone under review.">
              <Chip>{group.standing} with standing</Chip>
            </span>
          ) : null}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-1">
        {group.reasons.map((value) => (
          <Chip key={value} tone="warning">
            {reportReasonLabel(value)}
          </Chip>
        ))}
        {held ? <Chip>{held}</Chip> : null}
        {group.respondBy ? (
          <Chip tone={overdue ? "danger" : "primary"}>
            <Scale aria-hidden className="mr-1 inline size-3.5 align-[-2px]" />
            Legal complaint: act by {calendarDate(group.respondBy)}
          </Chip>
        ) : null}
      </div>

      {preview ? (
        <PostPreviewBlock preview={preview} />
      ) : group.snapshot ? (
        <blockquote className="mt-3 border-l-2 border-rail pl-3 text-[15px] leading-relaxed break-words whitespace-pre-wrap">{group.snapshot}</blockquote>
      ) : null}
      {group.href ? (
        <Link href={group.href} className="mt-2 inline-flex items-center gap-1 text-sm text-primary hover:underline">
          View {TARGET_LABELS[group.targetType].toLowerCase()}
          <ExternalLink aria-hidden className="size-3.5" />
        </Link>
      ) : null}

      <details className="mt-3 text-sm" open={group.respondBy !== null}>
        <summary className="cursor-pointer text-ink-muted hover:text-ink">What reporters said</summary>
        <ul className="mt-2 grid gap-2">
          {group.reports.map((report, index) => (
            <li key={index} className="rounded-md bg-wash px-3 py-2">
              <p className="flex items-baseline justify-between gap-3">
                <span className="font-medium">{reportReasonLabel(report.reason)}</span>
                <span className="font-mono text-xs text-ink-muted">
                  <LocalTime iso={report.createdAt} />
                </span>
              </p>
              {report.details ? <p className="mt-1 break-words whitespace-pre-wrap text-ink-muted">{report.details}</p> : null}
              {report.contact ? <p className="mt-1 break-words text-ink-muted">Contact: {report.contact}</p> : null}
            </li>
          ))}
        </ul>
      </details>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" disabled={pending} onClick={() => save(() => dismissReports({ targetType: group.targetType, targetId: group.targetId }), "Reports dismissed", onDone)}>
          Dismiss
        </Button>
        {content ? (
          <Button size="sm" variant="destructive" disabled={pending} onClick={() => save(() => moderate({ ...content, approve: false, reason, rule }), "Removed", onDone)}>
            <Trash2 />
            Remove {TARGET_LABELS[group.targetType].toLowerCase()}
          </Button>
        ) : null}
        {profile ? (
          <Menu
            label="Suspend or ban the author"
            align="start"
            trigger={
              <span className="inline-flex h-8 items-center gap-2 px-1 text-sm font-medium [&_svg]:size-4">
                <UserX />
                Suspend
              </span>
            }
            items={[
              ...SUSPENSION_LENGTHS.map((length) => ({
                kind: "action" as const,
                label: `Suspend @${profile.username} for ${length.label}`,
                onSelect: () =>
                  save(() => suspend({ profileId: profile.id, length: length.value, reason, rule }), `@${profile.username} is suspended for ${length.label}`, group.targetType === "profile" ? onDone : undefined),
              })),
              ...(profile.accountType === "person"
                ? [
                    {
                      kind: "action" as const,
                      label: `Ban @${profile.username}`,
                      danger: true,
                      onSelect: () => save(() => ban({ profileId: profile.id, reason, rule }), `@${profile.username} is banned`, onDone),
                    },
                    {
                      kind: "action" as const,
                      label: `Deactivate @${profile.username} as under 16`,
                      danger: true,
                      onSelect: () => save(() => deactivateUnder16({ profileId: profile.id, basis: "report" }), `@${profile.username} is deactivated and can ask for a review`, onDone),
                    },
                  ]
                : []),
            ]}
          />
        ) : null}
        {canVerify ? (
          <Button size="sm" variant="ghost" disabled={pending} onClick={() => save(() => verifyOrganisation(profile.id, true), `@${profile.username} is verified`)}>
            <BadgeCheck />
            Verify organisation
          </Button>
        ) : null}
        <RuleSelect value={rule} onChange={setRule} disabled={pending} />
        {reasonOpen ? null : (
          <Button size="sm" variant="ghost" disabled={pending} onClick={() => setReasonOpen(true)}>
            Add reason
          </Button>
        )}
      </div>
      {reasonOpen ? <ReasonField value={reason} onChange={setReason} disabled={pending} /> : null}
      <FormError message={error} />
    </article>
  );
}

export function ReportQueue({ groups }: { groups: ReportGroup[] }) {
  const [done, setDone] = useState<ReadonlySet<string>>(new Set());
  const visible = groups.filter((group) => !done.has(`${group.targetType}:${group.targetId}`));

  if (visible.length === 0) {
    return <EmptyState title="No open reports">When members report something, it shows up here, grouped by what was reported. Reporters stay anonymous.</EmptyState>;
  }

  return (
    <>
      <p className="border-b border-hairline px-4 py-3 text-sm text-ink-muted sm:px-6">
        Oldest first. Removing content or suspending someone tells them which rule it broke, with your reason if you give one, and how to appeal, but never who moderated. Dismissing brings back a
        post held after reports. Act on legal complaints by the date shown.
      </p>
      {visible.map((group) => {
        const key = `${group.targetType}:${group.targetId}`;
        return <ReportRow key={key} group={group} onDone={() => setDone((current) => new Set(current).add(key))} />;
      })}
    </>
  );
}
