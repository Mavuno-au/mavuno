import { DailyBars, ShareRow, Stat, StatGrid, share } from "@/components/operations/figures";
import { Section } from "@/components/ui/page";
import { loadMetrics } from "@/lib/data/operations";

export const dynamic = "force-dynamic";

function change(current: number, previous: number) {
  if (previous === 0) return current === 0 ? "Same as the week before" : "None the week before";
  const percent = Math.round(((current - previous) / previous) * 100);
  if (percent === 0) return "Same as the week before";
  return `${percent > 0 ? "+" : "−"}${Math.abs(percent)}% on the week before`;
}

export default async function MetricsPage() {
  const { signups, active, activation, retention, answered, daily } = await loadMetrics();

  return (
    <>
      <Section title="Active members" meta="Sydney days">
        <StatGrid>
          <Stat label="Today" value={active.day} />
          <Stat label="Last 7 days" value={active.week} />
          <Stat label="Last 30 days" value={active.month} />
          <Stat label="Daily / monthly" value={share(active.day, active.month)} note="How many come back daily" />
        </StatGrid>
      </Section>

      <Section title="Sign-ups">
        <StatGrid>
          <Stat label="Today" value={signups.today} />
          <Stat label="Last 7 days" value={signups.last7} note={change(signups.last7, signups.previous7)} />
          <Stat label="Last 30 days" value={signups.last30} />
          <Stat label="All time" value={signups.total} />
        </StatGrid>
      </Section>

      <Section title="First day" meta={`${activation.cohort} joined in the last 30 days`}>
        <div className="grid gap-4">
          <ShareRow label="Finished setup" part={activation.onboarded} whole={activation.cohort} />
          <ShareRow label="Followed someone" part={activation.followed} whole={activation.cohort} hint="Within 24 hours of joining" />
          <ShareRow label="Posted or replied" part={activation.posted} whole={activation.cohort} hint="Within 24 hours of joining" />
          <ShareRow label="Followed back" part={activation.followedBack} whole={activation.followed} hint="Of those who followed someone on day one, within a week" />
        </div>
      </Section>

      <Section title="Coming back" meta="joined in the 60 days before">
        <div className="grid gap-4">
          {retention.map((entry) => (
            <ShareRow key={entry.day} label={entry.day === 1 ? "After a day" : `After ${entry.day} days`} part={entry.returned} whole={entry.eligible} hint={`Used Mavuno on day ${entry.day} or later`} />
          ))}
        </div>
      </Section>

      <Section title="Conversation">
        <div className="grid gap-4">
          <ShareRow label="Posts answered within a day" part={answered.answered} whole={answered.posts} hint="Posts from the last 30 days that got a reply from someone else" />
          <ShareRow label="Active members who posted" part={active.postedMonth} whole={active.month} hint="In the last 30 days" />
        </div>
      </Section>

      <Section title="Last 30 days" className="border-b-0">
        <div className="grid gap-6">
          <DailyBars title="Active members" days={daily.map((entry) => ({ day: entry.day, value: entry.active }))} />
          <DailyBars title="Sign-ups" days={daily.map((entry) => ({ day: entry.day, value: entry.signups }))} />
          <DailyBars title="Posts and replies" days={daily.map((entry) => ({ day: entry.day, value: entry.posts }))} />
        </div>
      </Section>
    </>
  );
}
