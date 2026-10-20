import "server-only";
import { z } from "zod";
import { publicEnv } from "@/lib/env";
import { DISPLAY_TIME_ZONE } from "@/lib/format";
import { type Period, type Range, type Rate, periods, sydneyDay } from "@/lib/metrics";
import { serverEnv } from "@/lib/server-env";

// Visits come from Fathom, which counts anonymously and without cookies; the
// app sends it page views plus the guest-visit and signup events.

export type Visits = { name: string; visitors: number; pageviews: number };

export type Traffic =
  | { kind: "off" }
  | { kind: "unavailable" }
  | {
      kind: "ready";
      now: number;
      visitors: number;
      pageviews: number;
      conversion: { current: Rate; previous: Rate };
      pages: Visits[];
      referrers: Visits[];
      countries: Visits[];
      devices: Visits[];
    };

// Fathom sends counts as strings, and null for an empty range.
const number = z.coerce.number().int().nonnegative();
const currentSchema = z.object({ total: number });
const totalsSchema = z.array(z.object({ uniques: number, pageviews: number }));
const eventSchema = z.array(z.object({ unique_conversions: number }));
const breakdownSchema = z.array(z.looseObject({ uniques: number, pageviews: number }));

type Fathom = { token: string; siteId: string };

function config(): Fathom | null {
  const token = serverEnv.FATHOM_API_KEY;
  const siteId = publicEnv.fathomSiteId;
  return token && siteId ? { token, siteId } : null;
}

export function trafficConfigured() {
  return config() !== null;
}

// Each call counts against Fathom's rate limit, so current visitors are cached
// for a minute and reports for five, keyed by their days.
async function get(fathom: Fathom, path: string, query: Record<string, string>, revalidate: number): Promise<unknown> {
  const url = new URL(path, "https://api.usefathom.com/v1/");
  for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
  const response = await fetch(url, {
    headers: { authorization: `Bearer ${fathom.token}`, accept: "application/json" },
    signal: AbortSignal.timeout(5_000),
    next: { revalidate },
  });
  if (!response.ok) throw new Error(`Fathom answered ${response.status}`);
  return response.json();
}

function aggregate(fathom: Fathom, period: Period, query: Record<string, string>, event?: string) {
  return get(
    fathom,
    "aggregations",
    {
      ...(event === undefined
        ? { entity: "pageview", entity_id: fathom.siteId }
        : { entity: "event", site_id: fathom.siteId, entity_name: event }),
      date_from: `${period.from} 00:00:00`,
      date_to: `${period.to} 23:59:59`,
      timezone: DISPLAY_TIME_ZONE,
      ...query,
    },
    300,
  );
}

// People who sent the event: both sides of the sign-up rate come from Fathom,
// so ad blockers hide the same share of each and the rate between them holds.
async function eventVisitors(fathom: Fathom, period: Period, event: "guest-visit" | "signup") {
  const rows = eventSchema.parse(await aggregate(fathom, period, { aggregates: "unique_conversions" }, event));
  return rows[0]?.unique_conversions ?? 0;
}

async function breakdown(fathom: Fathom, period: Period, field: string): Promise<Visits[]> {
  const rows = breakdownSchema.parse(
    await aggregate(fathom, period, { aggregates: "uniques,pageviews", field_grouping: field, sort_by: "uniques:desc", limit: "10" }),
  );
  return rows.map((row) => {
    const name = row[field];
    return { name: typeof name === "string" ? name : "", visitors: row.uniques, pageviews: row.pageviews };
  });
}

async function conversion(fathom: Fathom, period: Period): Promise<Rate> {
  const [part, whole] = await Promise.all([eventVisitors(fathom, period, "signup"), eventVisitors(fathom, period, "guest-visit")]);
  return { part, whole };
}

export async function loadTraffic(range: Range): Promise<Traffic> {
  const fathom = config();
  if (!fathom) return { kind: "off" };
  const { current, previous } = periods(range, sydneyDay());
  try {
    const [now, totals, thisPeriod, lastPeriod, pages, referrers, countries, devices] = await Promise.all([
      get(fathom, "current_visitors", { site_id: fathom.siteId }, 60).then((body) => currentSchema.parse(body).total),
      aggregate(fathom, current, { aggregates: "uniques,pageviews" }).then((body) => totalsSchema.parse(body)[0]),
      conversion(fathom, current),
      conversion(fathom, previous),
      breakdown(fathom, current, "pathname"),
      breakdown(fathom, current, "referrer_hostname"),
      breakdown(fathom, current, "country_code"),
      breakdown(fathom, current, "device_type"),
    ]);
    return {
      kind: "ready",
      now,
      visitors: totals?.uniques ?? 0,
      pageviews: totals?.pageviews ?? 0,
      conversion: { current: thisPeriod, previous: lastPeriod },
      pages,
      referrers,
      countries,
      devices,
    };
  } catch {
    return { kind: "unavailable" };
  }
}
