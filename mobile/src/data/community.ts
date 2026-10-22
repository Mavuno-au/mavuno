import { z } from "zod";
import type { EventCategory } from "@/lib/catalogue";
import {
  CARD,
  EVENT,
  eventFormSchema,
  eventRow,
  newSpaceSchema,
  OPPORTUNITY,
  opportunityFormSchema,
  opportunityRow,
  rsvpSchema,
  savedListingRow,
  SPACE,
  spaceRoleSchema,
  spaceRow,
  upcomingFilter,
  type CommunityEvent,
  type EventScope,
  type Opportunity,
  type OpportunityFilter,
  type RsvpStatus,
  type SavedListing,
  type Space,
  type SpaceListItem,
  type SpaceRole,
  type SpaceTab,
} from "@/lib/community";
import { parsePeople, profileCardSchema, type PersonSummary } from "@/lib/domain";
import { done, fail, failFrom, ok, type Result } from "@/lib/result";
import { firstIssue } from "@/lib/schemas";
import { runTasks } from "@/data/api";
import { requestError } from "@/data/errors";
import { MEDIA_URL } from "@/data/posts";
import { supabase } from "@/data/supabase";

// The website's community loaders and actions (src/lib/data/community.ts,
// src/app/actions/{spaces,events,opportunities}.ts), with the same columns,
// rows and form rules from src/lib/community.ts.

export type { CommunityEvent, Opportunity, Space, SpaceListItem, SpaceRole } from "@/lib/community";

const id = z.uuid();

const lenient = <T>(schema: z.ZodType<T>, data: unknown) =>
  z
    .array(z.unknown())
    .parse(data ?? [])
    .flatMap((row) => {
      const parsed = schema.safeParse(row);
      return parsed.success ? [parsed.data] : [];
    });

async function memberships(viewerId: string) {
  const { data } = await supabase.from("space_members").select("space_id, role").eq("user_id", viewerId);
  const rows = z.array(z.object({ space_id: id, role: spaceRoleSchema })).catch([]).parse(data ?? []);
  return new Map(rows.map((row) => [row.space_id, row.role]));
}

export async function loadSpaces(tab: SpaceTab, viewerId: string): Promise<SpaceListItem[]> {
  const mine = await memberships(viewerId);
  const base = supabase.from("spaces").select(SPACE);
  const query = tab === "joined" ? base.in("id", [...mine.keys()]) : base.eq("kind", tab);
  const { data, error } = await query.order("is_official", { ascending: false }).order("members_count", { ascending: false }).order("name").limit(200);
  if (error) throw requestError("Spaces", error);
  return lenient(spaceRow, data).map((space) => ({ ...space, joined: mine.has(space.id) }));
}

export async function loadSpace(slug: string, viewerId: string): Promise<{ space: Space; role: SpaceRole | null } | null> {
  if (!/^[a-z0-9-]{2,40}$/.test(slug)) return null;
  const { data, error } = await supabase.from("spaces").select(SPACE).eq("slug", slug).maybeSingle();
  if (error) throw requestError("Space", error);
  if (!data) return null;
  const space = spaceRow.parse(data);
  return { space, role: (await memberships(viewerId)).get(space.id) ?? null };
}

export async function setMembership(viewerId: string, spaceId: string, join: boolean): Promise<Result> {
  const row = { space_id: id.parse(spaceId), user_id: viewerId };
  const { error } = join ? await supabase.from("space_members").upsert(row, { onConflict: "space_id,user_id", ignoreDuplicates: true }) : await supabase.from("space_members").delete().match(row);
  return error ? failFrom(error) : done;
}

// The form's fields as text, the way the website's form sends them.
export async function createSpace(fields: Record<string, string>): Promise<Result<string>> {
  const parsed = newSpaceSchema.safeParse(fields);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const space = parsed.data;
  const { error } = await supabase.rpc("create_space", {
    p_slug: space.slug,
    p_name: space.name,
    p_description: space.description,
    p_kind: space.kind,
    p_city_id: space.kind === "city" ? space.cityId : null,
    p_emoji: space.emoji || null,
  });
  if (error?.code === "23505") return fail("A space already uses that address. Try another.");
  if (error?.code === "23514") return fail("That address is taken.");
  if (error) return failFrom(error);
  return ok(space.slug);
}

export async function loadUpcomingEvents(scope: EventScope, category: EventCategory | null = null, limit = 50): Promise<CommunityEvent[]> {
  const base = supabase.from("events").select(EVENT).eq("status", "published").is("cancelled_at", null).or(upcomingFilter(Date.now()));
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
  if (error) throw requestError("Events", error);
  return lenient(eventRow, data);
}

export async function loadEvent(eventId: string, viewerId: string) {
  if (!id.safeParse(eventId).success) return null;
  const [{ data: row, error }, { data: attendees }, { data: mine }] = await Promise.all([
    supabase.from("events").select(EVENT).eq("id", eventId).maybeSingle(),
    supabase.from("event_rsvps").select(`user:profiles(${CARD})`).eq("event_id", eventId).eq("status", "going").order("created_at").limit(12),
    supabase.from("event_rsvps").select("status").eq("event_id", eventId).eq("user_id", viewerId).maybeSingle(),
  ]);
  if (error) throw requestError("Event", error);
  if (!row) return null;
  return {
    event: eventRow.parse(row),
    attendees: lenient(z.object({ user: profileCardSchema }), attendees).map((rsvp) => rsvp.user),
    myRsvp: z.object({ status: rsvpSchema }).nullable().catch(null).parse(mine ?? null)?.status ?? null,
  };
}

// Members may update only an RSVP's status, and an upsert would rewrite the
// key columns too, which Postgres refuses: update, and insert if nothing changed.
export async function setRsvp(viewerId: string, eventId: string, status: RsvpStatus | null): Promise<Result> {
  const key = { event_id: id.parse(eventId), user_id: viewerId };
  if (!status) {
    const { error } = await supabase.from("event_rsvps").delete().match(key);
    return error ? failFrom(error) : done;
  }
  const { data, error } = await supabase.from("event_rsvps").update({ status }).match(key).select("event_id");
  if (error) return failFrom(error);
  if (data.length > 0) return done;
  const { error: inserted } = await supabase.from("event_rsvps").insert({ ...key, status });
  return inserted ? failFrom(inserted) : done;
}

export async function cancelEvent(eventId: string): Promise<Result> {
  const { error } = await supabase.from("events").update({ cancelled_at: new Date().toISOString() }).eq("id", id.parse(eventId)).select("id").single();
  return error ? failFrom(error) : done;
}

const eventSchema = eventFormSchema(MEDIA_URL);

// `fields` are the form's values as text; `hostId` is the member or an organisation they help run.
export async function saveEvent(viewerId: string, fields: Record<string, string>, existing: { id: string } | { hostId: string }): Promise<Result<SavedListing>> {
  const parsed = eventSchema.safeParse(fields);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  if ("hostId" in existing && Date.parse(parsed.data.starts_at) < Date.now()) return fail("Choose a start time in the future.");
  const query =
    "id" in existing
      ? supabase.from("events").update(parsed.data).eq("id", id.parse(existing.id))
      : supabase.from("events").insert({ ...parsed.data, host_id: id.parse(existing.hostId), created_by: viewerId });
  const { data, error } = await query.select("id, status").single();
  if (error) return failFrom(error);
  const saved = savedListingRow.parse(data);
  runTasks(saved.id);
  return ok(saved);
}

export async function loadOpportunities(filter: OpportunityFilter, limit = 50): Promise<Opportunity[]> {
  const base = supabase.from("opportunities").select(OPPORTUNITY).eq("status", "published").is("closed_at", null).or(`deadline_at.is.null,deadline_at.gte."${new Date().toISOString()}"`);
  const typed = filter.type ? base.eq("type", filter.type) : base;
  const placed = filter.cityId ? typed.eq("city_id", filter.cityId) : typed;
  const { data, error } = await (filter.remote ? placed.eq("is_remote", true) : placed).order("created_at", { ascending: false }).limit(limit);
  if (error) throw requestError("Opportunities", error);
  return lenient(opportunityRow, data);
}

export async function loadOpportunity(opportunityId: string, viewerId: string) {
  if (!id.safeParse(opportunityId).success) return null;
  const [{ data: row, error }, { data: saved }] = await Promise.all([
    supabase.from("opportunities").select(OPPORTUNITY).eq("id", opportunityId).maybeSingle(),
    supabase.from("saved_opportunities").select("opportunity_id").eq("opportunity_id", opportunityId).eq("user_id", viewerId).maybeSingle(),
  ]);
  if (error) throw requestError("Opportunity", error);
  if (!row) return null;
  return { opportunity: opportunityRow.parse(row), saved: Boolean(saved) };
}

export async function setOpportunitySaved(viewerId: string, opportunityId: string, saved: boolean): Promise<Result> {
  const row = { user_id: viewerId, opportunity_id: id.parse(opportunityId) };
  const { error } = saved ? await supabase.from("saved_opportunities").upsert(row, { onConflict: "user_id,opportunity_id", ignoreDuplicates: true }) : await supabase.from("saved_opportunities").delete().match(row);
  return error ? failFrom(error) : done;
}

export async function closeOpportunity(opportunityId: string): Promise<Result> {
  const { error } = await supabase.from("opportunities").update({ closed_at: new Date().toISOString() }).eq("id", id.parse(opportunityId)).select("id").single();
  return error ? failFrom(error) : done;
}

export async function saveOpportunity(viewerId: string, fields: Record<string, string>, existing: { id: string } | { posterId: string }): Promise<Result<SavedListing>> {
  const parsed = opportunityFormSchema.safeParse(fields);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  if ("posterId" in existing && parsed.data.deadline_at && Date.parse(parsed.data.deadline_at) < Date.now()) return fail("Choose a deadline that hasn't passed.");
  const query =
    "id" in existing
      ? supabase.from("opportunities").update(parsed.data).eq("id", id.parse(existing.id))
      : supabase.from("opportunities").insert({ ...parsed.data, poster_id: id.parse(existing.posterId), created_by: viewerId });
  const { data, error } = await query.select("id, status").single();
  if (error) return failFrom(error);
  const saved = savedListingRow.parse(data);
  runTasks(saved.id);
  return ok(saved);
}

export async function loadNearbyCityIds(cityId: number, radiusKm: number) {
  const { data } = await supabase.rpc("nearby_city_ids", { p_city_id: cityId, p_radius_km: radiusKm });
  return z.array(z.number()).catch([]).parse(data ?? []);
}

export async function loadNearbyPeople(cityId: number, radiusKm: number, interest: string | null): Promise<PersonSummary[]> {
  const { data, error } = await supabase.rpc("nearby_profiles", { p_city_id: cityId, p_radius_km: radiusKm, p_interest: interest, p_limit: 30 });
  if (error) throw requestError("Nearby people", error);
  return parsePeople(data);
}

export async function loadCitySpace(cityId: number, viewerId: string): Promise<SpaceListItem | null> {
  const { data } = await supabase.from("spaces").select(SPACE).eq("kind", "city").eq("city_id", cityId).order("is_official", { ascending: false }).order("members_count", { ascending: false }).limit(1).maybeSingle();
  const space = spaceRow.safeParse(data).data;
  if (!space) return null;
  return { ...space, joined: (await memberships(viewerId)).has(space.id) };
}

// Discover's building blocks (src/lib/data/discover.ts and shell.ts).
const topicRows = z.array(z.object({ topic: z.string(), post_count: z.number(), people_count: z.number() }));

export async function loadTrendingTopics(limit = 12) {
  const { data, error } = await supabase.rpc("trending_topics", { p_days: 7, p_limit: limit });
  if (error) throw requestError("Topics", error);
  return topicRows
    .catch([])
    .parse(data ?? [])
    .map((row) => ({ topic: row.topic, posts: row.post_count, people: row.people_count }));
}

export async function loadSuggestions(limit = 6, accountType: "person" | "organisation" | null = null): Promise<PersonSummary[]> {
  const { data, error } = await supabase.rpc("suggested_profiles", accountType ? { p_limit: limit, p_account_type: accountType } : { p_limit: limit });
  if (error) throw requestError("Suggestions", error);
  return parsePeople(data);
}

export async function dismissSuggestion(viewerId: string, profileId: string, dismissed: boolean): Promise<Result> {
  const row = { user_id: viewerId, dismissed_id: id.parse(profileId) };
  const { error } = dismissed ? await supabase.from("suggestion_dismissals").upsert(row, { onConflict: "user_id,dismissed_id", ignoreDuplicates: true }) : await supabase.from("suggestion_dismissals").delete().match(row);
  return error ? failFrom(error) : done;
}

export async function searchPeople(query: string, limit = 30): Promise<PersonSummary[]> {
  const { data, error } = await supabase.rpc("search_profiles", { p_query: query, p_limit: limit });
  if (error) throw requestError("Search", error);
  return parsePeople(data);
}

export async function loadActiveSpaces(viewerId: string, limit = 8): Promise<SpaceListItem[]> {
  const mine = await memberships(viewerId);
  const { data, error } = await supabase.from("spaces").select(SPACE).order("last_post_at", { ascending: false, nullsFirst: false }).order("members_count", { ascending: false }).limit(limit);
  if (error) throw requestError("Spaces", error);
  return lenient(spaceRow, data).map((space) => ({ ...space, joined: mine.has(space.id) }));
}
