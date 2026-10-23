import "server-only";
import { cache } from "react";
import { z } from "zod";
import type { EventCategory } from "@/lib/catalogue";
import {
  CARD,
  EVENT,
  eventRow,
  OPPORTUNITY,
  opportunityRow,
  rsvpSchema,
  SPACE,
  spaceRoleSchema,
  spaceRow,
  upcomingFilter,
  type CommunityEvent,
  type EventScope,
  type Opportunity,
  type OpportunityFilter,
  type Space,
  type SpaceListItem,
  type SpaceRole,
  type SpaceTab,
} from "@/lib/community";
import { parsePeople, profileCardSchema } from "@/lib/domain";
import { createClient } from "@/lib/supabase/server";
import type { Viewer } from "@/lib/viewer";

export * from "@/lib/community";

const id = z.uuid();

async function memberships(viewer: Viewer | null) {
  if (!viewer) return new Map<string, SpaceRole>();
  const supabase = await createClient();
  const { data } = await supabase.from("space_members").select("space_id, role").eq("user_id", viewer.id);
  const rows = z.array(z.object({ space_id: id, role: spaceRoleSchema })).parse(data ?? []);
  return new Map(rows.map((row) => [row.space_id, row.role]));
}

export async function loadSpaces(tab: SpaceTab, viewer: Viewer | null): Promise<SpaceListItem[]> {
  const supabase = await createClient();
  const mine = await memberships(viewer);
  const base = supabase.from("spaces").select(SPACE);
  const query = tab === "joined" ? base.in("id", [...mine.keys()]) : base.eq("kind", tab);
  const { data } = await query.order("is_official", { ascending: false }).order("members_count", { ascending: false }).order("name").limit(200);
  return z
    .array(spaceRow)
    .parse(data ?? [])
    .map((space) => ({ ...space, joined: mine.has(space.id) }));
}

export const loadSpace = cache(async (slug: string, viewer: Viewer | null): Promise<{ space: Space; role: SpaceRole | null } | null> => {
  if (!/^[a-z0-9-]{2,40}$/.test(slug)) return null;
  const supabase = await createClient();
  const { data } = await supabase.from("spaces").select(SPACE).eq("slug", slug).maybeSingle();
  if (!data) return null;
  const space = spaceRow.parse(data);
  return { space, role: (await memberships(viewer)).get(space.id) ?? null };
});

export async function loadCitySpace(cityId: number, viewer: Viewer | null): Promise<SpaceListItem | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("spaces")
    .select(SPACE)
    .eq("kind", "city")
    .eq("city_id", cityId)
    .order("is_official", { ascending: false })
    .order("members_count", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  const space = spaceRow.parse(data);
  return { ...space, joined: (await memberships(viewer)).has(space.id) };
}

export async function loadUpcomingEvents(scope: EventScope, category: EventCategory | null = null, limit = 50): Promise<CommunityEvent[]> {
  const supabase = await createClient();
  const now = Date.now();
  const base = supabase.from("events").select(EVENT).eq("status", "published").is("cancelled_at", null).or(upcomingFilter(now));
  const scoped = (() => {
    switch (scope.kind) {
      case "all":
        return base;
      case "online":
        return base.in("format", ["online", "hybrid"]);
      case "cities":
        return base.in("city_id", scope.cityIds);
      case "space":
        return base.eq("space_id", scope.spaceId);
      default: {
        const exhaustive: never = scope;
        return exhaustive;
      }
    }
  })();
  const { data, error } = await (category ? scoped.eq("category", category) : scoped).order("starts_at").limit(limit);
  if (error) throw new Error(`Events failed: ${error.message}`);
  return z.array(eventRow).parse(data ?? []);
}

export const loadEvent = cache(async (eventId: string, viewer: Viewer | null) => {
  if (!id.safeParse(eventId).success) return null;
  const supabase = await createClient();
  // Who is going and the online link are for members only.
  const [{ data: row }, attendees, mine, onlineUrl] = await Promise.all([
    supabase.from("events").select(EVENT).eq("id", eventId).maybeSingle(),
    viewer ? supabase.rpc("event_attendees", { p_event_id: eventId }).select(CARD) : null,
    viewer ? supabase.from("event_rsvps").select("status").eq("event_id", eventId).eq("user_id", viewer.id).maybeSingle() : null,
    viewer ? supabase.rpc("event_online_url", { p_event_id: eventId }) : null,
  ]);
  if (!row) return null;
  return {
    event: { ...eventRow.parse(row), onlineUrl: z.string().nullable().parse(onlineUrl?.data ?? null) },
    attendees: z.array(profileCardSchema).parse(attendees?.data ?? []),
    myRsvp: z.object({ status: rsvpSchema }).nullable().parse(mine?.data ?? null)?.status ?? null,
  };
});

export async function loadNearbyCityIds(cityId: number, radiusKm: number) {
  const supabase = await createClient();
  const { data } = await supabase.rpc("nearby_city_ids", { p_city_id: cityId, p_radius_km: radiusKm });
  return z.array(z.number()).parse(data ?? []);
}

export async function loadNearbyEvents(cityId: number, radiusKm: number, limit = 50) {
  return loadUpcomingEvents({ kind: "cities", cityIds: await loadNearbyCityIds(cityId, radiusKm) }, null, limit);
}

export async function loadOpportunities(filter: OpportunityFilter, limit = 50): Promise<Opportunity[]> {
  const supabase = await createClient();
  const base = supabase
    .from("opportunities")
    .select(OPPORTUNITY)
    .eq("status", "published")
    .is("closed_at", null)
    .or(`deadline_at.is.null,deadline_at.gte."${new Date().toISOString()}"`);
  const typed = filter.type ? base.eq("type", filter.type) : base;
  const placed = filter.cityId ? typed.eq("city_id", filter.cityId) : typed;
  const { data, error } = await (filter.remote ? placed.eq("is_remote", true) : placed).order("created_at", { ascending: false }).limit(limit);
  if (error) throw new Error(`Opportunities failed: ${error.message}`);
  return z.array(opportunityRow).parse(data ?? []);
}

export const loadOpportunity = cache(async (opportunityId: string, viewer: Viewer | null) => {
  if (!id.safeParse(opportunityId).success) return null;
  const supabase = await createClient();
  const [{ data: row }, saved] = await Promise.all([
    supabase.from("opportunities").select(OPPORTUNITY).eq("id", opportunityId).maybeSingle(),
    viewer ? supabase.from("saved_opportunities").select("opportunity_id").eq("opportunity_id", opportunityId).eq("user_id", viewer.id).maybeSingle() : null,
  ]);
  if (!row) return null;
  return { opportunity: opportunityRow.parse(row), saved: Boolean(saved?.data) };
});

export async function loadNearbyPeople(cityId: number, radiusKm: number, interest: string | null) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("nearby_profiles", { p_city_id: cityId, p_radius_km: radiusKm, p_interest: interest, p_limit: 30 });
  if (error) throw new Error(`Nearby people failed: ${error.message}`);
  return parsePeople(data);
}

