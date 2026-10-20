import Link from "next/link";
import type { ReactNode } from "react";
import { AutoRefresh } from "@/components/operations/auto-refresh";
import { Stat, StatGrid } from "@/components/operations/figures";
import { LocalTime } from "@/components/ui/local-time";
import { Chip, Section } from "@/components/ui/page";
import { type CronJob, loadHealth } from "@/lib/data/operations";

export const metadata = { title: "Health" };
export const dynamic = "force-dynamic";

const DAY = 24 * 60 * 60 * 1000;

type Status = { kind: "ok" } | { kind: "attention"; reason: string };

function waiting(count: number, oldest: string | null, checkedAt: string): Status {
  if (count === 0 || !oldest) return { kind: "ok" };
  return new Date(checkedAt).getTime() - new Date(oldest).getTime() > DAY ? { kind: "attention", reason: "Waiting over a day" } : { kind: "ok" };
}

function StatusChip({ status }: { status: Status }) {
  switch (status.kind) {
    case "ok":
      return <Chip tone="primary">OK</Chip>;
    case "attention":
      return <Chip tone="warning">{status.reason}</Chip>;
  }
}

function Check({ title, status, children }: { title: string; status: Status; children: ReactNode }) {
  return (
    <li className="flex items-start justify-between gap-4 border-b border-hairline px-4 py-4 last:border-b-0 sm:px-6">
      <div className="grid gap-0.5">
        <span className="font-medium">{title}</span>
        <div className="text-sm text-ink-muted">{children}</div>
      </div>
      <StatusChip status={status} />
    </li>
  );
}

function cronStatus(jobs: CronJob[] | null): Status {
  if (jobs === null) return { kind: "attention", reason: "Can't read" };
  if (jobs.some((job) => job.failedLastDay > 0)) return { kind: "attention", reason: "Failing" };
  if (jobs.some((job) => !job.active)) return { kind: "attention", reason: "Paused" };
  return { kind: "ok" };
}

function CronJobs({ jobs }: { jobs: CronJob[] | null }) {
  if (jobs === null) return <>pg_cron isn&apos;t installed or can&apos;t be read here. Without it, schedule /api/maintenance every minute.</>;
  if (jobs.length === 0) return <>No jobs are scheduled. Schedule /api/maintenance, or apply the migrations that add them.</>;
  return (
    <ul className="mt-1 grid gap-1.5">
      {jobs.map((job, index) => (
        <li key={job.name ?? index}>
          <span className="font-mono text-ink">{job.name ?? "unnamed job"}</span>{" "}
          <span className="font-mono text-xs">{job.schedule}</span>
          {job.active ? null : " · paused"}
          {job.lastRun ? (
            <>
              {" "}
              · last run <LocalTime iso={job.lastRun} />
              {job.lastStatus && job.lastStatus !== "succeeded" ? ` (${job.lastStatus})` : null}
            </>
          ) : (
            " · no recent runs"
          )}
          {job.failedLastDay > 0 ? (
            <span className="block text-destructive">
              {job.failedLastDay} failed in the last day{job.lastError ? `: ${job.lastError}` : "."}
            </span>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

export default async function HealthPage() {
  const health = await loadHealth();
  const { lastDay } = health;

  return (
    <>
      <AutoRefresh seconds={15} />
      <ul className="border-b border-hairline">
        <Check title="Reports" status={waiting(health.openReports, health.oldestOpenReport, health.checkedAt)}>
          {health.openReports === 0 ? "None open." : `${health.openReports} open`}
          {health.oldestOpenReport ? (
            <>
              , oldest <LocalTime iso={health.oldestOpenReport} />.{" "}
              <Link href="/moderation/reports" className="text-primary hover:underline">Review reports</Link>
            </>
          ) : null}
        </Check>
        <Check title="Review queue" status={waiting(health.awaitingReview, health.oldestAwaitingReview, health.checkedAt)}>
          {health.awaitingReview === 0 ? "Nothing waiting." : `${health.awaitingReview} waiting`}
          {health.oldestAwaitingReview ? (
            <>
              , oldest post <LocalTime iso={health.oldestAwaitingReview} />.{" "}
              <Link href="/moderation" className="text-primary hover:underline">Open the queue</Link>
            </>
          ) : null}
        </Check>
        <Check title="Erasing deleted posts" status={health.purgeBacklog === 0 ? { kind: "ok" } : { kind: "attention", reason: "Behind" }}>
          {health.purgeBacklog === 0
            ? "Deleted posts are being erased on time."
            : `${health.purgeBacklog} deleted posts are older than five minutes. Check the pg_cron job, or schedule /api/maintenance.`}
        </Check>
        <Check title="Removing old files" status={health.storageBacklog === 0 ? { kind: "ok" } : { kind: "attention", reason: "Behind" }}>
          {health.storageBacklog === 0 ? "Photos from deleted posts are being removed." : `${health.storageBacklog} files have waited more than a day. Schedule /api/maintenance.`}
        </Check>
        <Check title="Publishing scheduled posts" status={health.overdueScheduled === 0 ? { kind: "ok" } : { kind: "attention", reason: "Behind" }}>
          {health.oldestOverdueScheduled === null ? (
            "Scheduled posts are going out on time."
          ) : (
            <>
              {health.overdueScheduled} more than five minutes late, the oldest due <LocalTime iso={health.oldestOverdueScheduled} />. Check the pg_cron job, or schedule
              /api/maintenance.
            </>
          )}
        </Check>
        <Check title="Deleting under-16 accounts" status={health.agePurgeOverdue === 0 ? { kind: "ok" } : { kind: "attention", reason: "Behind" }}>
          {health.nextAgePurge === null ? (
            "No deactivated accounts are waiting."
          ) : (
            <>
              {health.ageDeactivated} deactivated and waiting, the next deleted <LocalTime iso={health.nextAgePurge} format="full" />.
              {health.agePurgeOverdue > 0 ? ` ${health.agePurgeOverdue} are past their 30 days: check the daily pg_cron job, or schedule /api/maintenance.` : null}
            </>
          )}
        </Check>
        <Check title="Scheduled jobs" status={cronStatus(health.cron)}>
          <CronJobs jobs={health.cron} />
        </Check>
        <Check title="Suspended accounts" status={{ kind: "ok" }}>
          {health.suspended === 0 ? "No one is suspended." : `${health.suspended} currently suspended.`}
        </Check>
      </ul>

      <Section
        title="Last 24 hours"
        meta={
          <>
            Checked <LocalTime iso={health.checkedAt} format="full" />, every 15 seconds
          </>
        }
        className="border-b-0"
      >
        <StatGrid>
          <Stat label="Sign-ups" value={lastDay.signups} />
          <Stat label="Posts" value={lastDay.posts} />
          <Stat label="Messages" value={lastDay.messages} />
          <Stat label="Reports" value={lastDay.reports} />
        </StatGrid>
      </Section>
    </>
  );
}
