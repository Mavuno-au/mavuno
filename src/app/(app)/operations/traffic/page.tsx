import { ShareRow, Stat, StatGrid, VisitsList, share } from "@/components/operations/figures";
import { RangePicker } from "@/components/operations/range-picker";
import { EmptyState, Section } from "@/components/ui/page";
import { type Visits, loadTraffic } from "@/lib/data/traffic";
import { parseRange, pointsChange } from "@/lib/metrics";

export const metadata = { title: "Traffic" };
export const dynamic = "force-dynamic";

const regions = new Intl.DisplayNames(["en-AU"], { type: "region" });

function country(code: string) {
  if (!/^[A-Z]{2}$/.test(code)) return "Unknown";
  return regions.of(code) ?? code;
}

const rows = (visits: Visits[], name: (value: string) => string) =>
  visits.map((entry) => ({ key: entry.name, name: name(entry.name), visitors: entry.visitors, pageviews: entry.pageviews }));

function Code({ children }: { children: string }) {
  return <code className="rounded bg-wash px-1 font-mono text-[13px] text-ink">{children}</code>;
}

export default async function TrafficPage({ searchParams }: PageProps<"/operations/traffic">) {
  const range = parseRange((await searchParams).range);
  const traffic = await loadTraffic(range);

  switch (traffic.kind) {
    case "off":
      return (
        <EmptyState title="Traffic isn't connected">
          <p>
            Set <Code>NEXT_PUBLIC_FATHOM_SITE_ID</Code> to the Fathom site and <Code>FATHOM_API_KEY</Code> to an API token that can read it (Fathom → Settings →
            API), then redeploy. Visits, top pages and the sign-up rate will show here.
          </p>
        </EmptyState>
      );
    case "unavailable":
      return (
        <>
          <RangePicker range={range} path="/operations/traffic" />
          <EmptyState title="Fathom didn't answer">Try again in a minute. Its numbers are cached for five minutes once they arrive.</EmptyState>
        </>
      );
    case "ready": {
      const { current, previous } = traffic.conversion;
      const points = pointsChange(current, previous);
      return (
        <>
          <RangePicker range={range} path="/operations/traffic" note="From Fathom, cached for five minutes" />

          <Section title="Visits">
            <StatGrid>
              <Stat label="On the site now" value={traffic.now} />
              <Stat label={`Visitors, last ${range} days`} value={traffic.visitors} />
              <Stat label="Page views" value={traffic.pageviews} />
              <Stat label="Sign-up rate" value={share(current.part, current.whole)} />
            </StatGrid>
          </Section>

          <Section title="Sign-ups from visits">
            <ShareRow
              label="Visitors who signed up"
              hint="People who sent a sign-up event, of the people not signed in who sent a guest visit. Both come from Fathom, so ad blockers hide the same share of each."
              part={current.part}
              whole={current.whole}
              change={{ points, worst: points !== null && points < 0 }}
            />
          </Section>

          <Section title={`Last ${range} days`} className="border-b-0">
            <div className="grid gap-6 sm:grid-cols-2">
              <VisitsList title="Top pages" rows={rows(traffic.pages, (path) => path || "/")} empty="No page views yet." />
              <VisitsList title="Referrers" rows={rows(traffic.referrers, (host) => host || "Direct or unknown")} empty="No visits yet." />
              <VisitsList title="Countries" rows={rows(traffic.countries, country)} empty="No visits yet." />
              <VisitsList title="Devices" rows={rows(traffic.devices, (device) => device || "Unknown")} empty="No visits yet." />
            </div>
          </Section>
        </>
      );
    }
  }
}
