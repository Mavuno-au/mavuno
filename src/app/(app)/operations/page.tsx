import { DailyBars, RateBars, ShareRow, Stat, StatGrid, ValueRow, share } from "@/components/operations/figures";
import { RangePicker } from "@/components/operations/range-picker";
import { Section } from "@/components/ui/page";
import { type Rates, loadMetrics } from "@/lib/data/operations";
import { type Rate, biggestDrop, duration, parseRange, pointsChange } from "@/lib/metrics";

export const dynamic = "force-dynamic";

function change(current: number, previous: number, days: number) {
  const before = `the ${days} days before`;
  if (previous === 0) return current === 0 ? `Same as ${before}` : `None ${before}`;
  const percent = Math.round(((current - previous) / previous) * 100);
  if (percent === 0) return `Same as ${before}`;
  return `${percent > 0 ? "+" : "−"}${Math.abs(percent)}% on ${before}`;
}

const RETENTION = [
  { day: 1, key: "returned1" },
  { day: 7, key: "returned7" },
  { day: 14, key: "returned14" },
] as const;

function returnedBy(rates: Rates, day: number): Rate {
  const entry = rates.retention.find((candidate) => candidate.day === day);
  return { part: entry?.returned ?? 0, whole: entry?.eligible ?? 0 };
}

// Every rate on the page that can be compared with the period before.
function ratesOf(rates: Rates) {
  const { activation, firstDay, answered } = rates;
  return {
    activation: { part: activation.activated, whole: activation.eligible },
    onboarded: { part: firstDay.onboarded, whole: firstDay.eligible },
    followed: { part: firstDay.followed, whole: firstDay.eligible },
    posted: { part: firstDay.posted, whole: firstDay.eligible },
    followedBack: { part: firstDay.followedBack, whole: firstDay.followed },
    answered: { part: answered.answered, whole: answered.posts },
    firstAnswered: { part: answered.firstAnswered, whole: answered.firstPosts },
    returned1: returnedBy(rates, 1),
    returned7: returnedBy(rates, 7),
    returned14: returnedBy(rates, 14),
  } satisfies Record<string, Rate>;
}

type RateKey = keyof ReturnType<typeof ratesOf>;

export default async function MetricsPage({ searchParams }: PageProps<"/operations">) {
  const range = parseRange((await searchParams).range);
  const { days, signups, active, current, previous, daily } = await loadMetrics(range);

  const now = ratesOf(current);
  const before = ratesOf(previous);
  const keys = Object.keys(now).filter((key): key is RateKey => key in now);
  const worst = biggestDrop(keys.map((key) => ({ key, points: pointsChange(now[key], before[key]) })));
  const rate = (key: RateKey) => ({ ...now[key], change: { points: pointsChange(now[key], before[key]), worst: worst === key } });

  const activationDays = daily.map(({ day }) => {
    const entry = current.activationByDay.find((candidate) => candidate.day === day);
    return { day, part: entry?.activated ?? 0, whole: entry?.eligible ?? 0, complete: entry?.complete ?? true };
  });

  return (
    <>
      <RangePicker range={range} path="/operations" note={`Changes compare with the ${days} days before`} />

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
          <Stat label={`Last ${days} days`} value={signups.range} note={change(signups.range, signups.previousRange, days)} />
          <Stat label={`${days} days before`} value={signups.previousRange} />
          <Stat label="All time" value={signups.total} />
        </StatGrid>
      </Section>

      <Section title="Activation" meta={`${current.activation.eligible} joined in the last ${days} days`}>
        <div className="grid gap-5">
          <ShareRow
            label="Found value within 12 hours"
            hint="Liked or saved posts by 3 or more people, or posted and got a reply, quote or like. Sign-ups at least 12 hours old"
            {...rate("activation")}
          />
          <RateBars title="Activated, by sign-up day" days={activationDays} note="Lighter days are still counting: some of their sign-ups are under 12 hours old." />
        </div>
      </Section>

      <Section title="First day" meta={`${current.firstDay.eligible} have had a full first day`}>
        <div className="grid gap-4">
          <ShareRow label="Finished setup" {...rate("onboarded")} />
          <ShareRow label="Followed someone" hint="Within 24 hours of joining" {...rate("followed")} />
          <ValueRow
            label="Follows in the first 24 hours"
            hint="Median, counting those who followed no one"
            value={current.firstDay.medianFollows === null ? "–" : current.firstDay.medianFollows}
          />
          <ShareRow label="Posted or replied" hint="Within 24 hours of joining" {...rate("posted")} />
          <ShareRow label="Followed back" hint="Of those who followed someone on day one, within a week" {...rate("followedBack")} />
        </div>
      </Section>

      <Section title="Coming back" meta={`day N in the last ${days} days`}>
        <div className="grid gap-4">
          {RETENTION.map(({ day, key }) => (
            <ShareRow key={day} label={day === 1 ? "After a day" : `After ${day} days`} hint={`Used Mavuno on day ${day} or later`} {...rate(key)} />
          ))}
        </div>
      </Section>

      <Section title="Conversation">
        <div className="grid gap-4">
          <ShareRow
            label="Posts answered within a day"
            hint={
              <>
                Replied to, quoted or liked by someone else.
                {current.answered.medianMinutes === null ? null : ` First answer after ${duration(current.answered.medianMinutes)} (median).`}
              </>
            }
            {...rate("answered")}
          />
          <ShareRow label="First posts answered within a day" hint="A member's very first post" {...rate("firstAnswered")} />
          <ShareRow label="Active members who posted" part={active.postedMonth} whole={active.month} hint="In the last 30 days" />
        </div>
      </Section>

      <Section title={`Last ${days} days`} className="border-b-0">
        <div className="grid gap-6">
          <DailyBars title="Active members" days={daily.map((entry) => ({ day: entry.day, value: entry.active }))} />
          <DailyBars title="Sign-ups" days={daily.map((entry) => ({ day: entry.day, value: entry.signups }))} />
          <DailyBars title="Posts and replies" days={daily.map((entry) => ({ day: entry.day, value: entry.posts }))} />
        </div>
      </Section>
    </>
  );
}
