import "server-only";
import { cache } from "react";
import { z } from "zod";
import { AU_TIMEZONES, EVENT_CATEGORIES, EVENT_FORMATS, type EventCategory } from "@/lib/catalogue";
import { CITY_PHOTO_COLUMNS, cityPhotoSchema, contentStatusSchema, opportunityTypeSchema, parsePeople, profileCardSchema, type ContentStatus, type OpportunityType } from "@/lib/domain";
import { createClient } from "@/lib/supabase/server";
import type { Viewer } from "@/lib/viewer";

const id = z.uuid();
const CARD = "id, username, display_name, avatar_url, colour:effective_colour, account_type, org_verified, headline";

export const eventCategorySchema = z.custom<EventCategory>(
  (value) => typeof value === "string" && Object.hasOwn(EVENT_CATEGORIES, value),
  "Choose a category.",
);
export type EventFormat = keyof typeof EVENT_FORMATS;
export const eventFormatSchema = z.custom<EventFormat>((value) => typeof value === "string" && Object.hasOwn(EVENT_FORMATS, value), "Choose a format.");
export type AuTimezone = (typeof AU_TIMEZONES)[number]["value"];
export const timezoneSchema = z.custom<AuTimezone>((value) => AU_TIMEZONES.some((zone) => zone.value === value), "Choose a time zone.");

export const formField = {
  text: (max: number, message: string) =>
    z
      .string()
      .trim()
      .max(max, message)
      .optional()
      .transform((value) => value || null),
  number: (min: number, max: number, message: string) =>
    z
      .string()
      .trim()
      .optional()
      .transform((value) => (value ? Number(value) : null))
      .pipe(z.number(message).int(message).min(min, message).max(max, message).nullable()),
  checkbox: z
    .string()
    .optional()
    .transform((value) => value === "on"),
};

// Deadlines are picked as a date and close at the end of that day on the east coast.
export const DEADLINE_ZONE: AuTimezone = "Australia/Sydney";

function zoneOffset(instant: number, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
  }).formatToParts(instant);
  const part = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((item) => item.type === type)?.value);
  return Date.UTC(part("year"), part("month") - 1, part("day"), part("hour"), part("minute"), part("second")) - Math.floor(instant / 1000) * 1000;
}

// "2026-11-01T18:30" on the clock in `timeZone`, as an instant.
export function fromZonedInput(local: string, timeZone: string) {
  const wall = Date.parse(`${local}:00Z`);
  return new Date(wall - zoneOffset(wall - zoneOffset(wall, timeZone), timeZone)).toISOString();
}

export function toZonedInput(iso: string, timeZone: string) {
  const instant = Date.parse(iso);
  return new Date(instant + zoneOffset(instant, timeZone)).toISOString().slice(0, 16);
}

export type SavedListing = { id: string; status: ContentStatus };

export type Review = { kind: "published" } | { kind: "pending" } | { kind: "rejected"; reason: string | null };

function review(status: ContentStatus, reason: string | null): Review {
  switch (status) {
    case "published":
      return { kind: "published" };
    case "pending":
      return { kind: "pending" };
    case "rejected":
      return { kind: "rejected", reason };
    default: {
      const exhaustive: never = status;
      return exhaustive;
    }
  }
}

const SPACE = `id, slug, name, description, kind, city_id, emoji, is_official, members_count, posts_count, last_post_at, city:cities(${CITY_PHOTO_COLUMNS})`;

export const spaceKindSchema = z.enum(["city", "interest"]);
export type SpaceKind = z.infer<typeof spaceKindSchema>;
const spaceRoleSchema = z.enum(["owner", "moderator", "member"]);
export type SpaceRole = z.infer<typeof spaceRoleSchema>;

const spaceRow = z
  .object({
    id,
    slug: z.string(),
    name: z.string(),
    description: z.string(),
    kind: spaceKindSchema,
    city_id: z.number().nullable(),
    emoji: z.string().nullable(),
    is_official: z.boolean(),
    members_count: z.number(),
    posts_count: z.number(),
    last_post_at: z.string().nullable(),
    city: cityPhotoSchema,
  })
  .transform((s) => ({
    id: s.id,
    slug: s.slug,
    name: s.name,
    description: s.description,
    kind: s.kind,
    cityId: s.city_id,
    emoji: s.emoji,
    official: s.is_official,
    members: s.members_count,
    posts: s.posts_count,
    lastPostAt: s.last_post_at,
    photo: s.city,
  }));
export type Space = z.infer<typeof spaceRow>;
export type SpaceListItem = Space & { joined: boolean };

async function memberships(viewer: Viewer | null) {
  if (!viewer) return new Map<string, SpaceRole>();
  const supabase = await createClient();
  const { data } = await supabase.from("space_members").select("space_id, role").eq("user_id", viewer.id);
  const rows = z.array(z.object({ space_id: id, role: spaceRoleSchema })).parse(data ?? []);
  return new Map(rows.map((row) => [row.space_id, row.role]));
}

export type SpaceTab = SpaceKind | "joined";

// Addresses under /spaces that are pages, not spaces. Mirrored by a check on
// public.spaces.slug.
export const RESERVED_SPACE_SLUGS = ["new", "interests", "joined"] as const;

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

const EVENT = `id, host_id, created_by, status, title, description, category, format, starts_at, ends_at, timezone, city_id,
  venue_name, address, online_url, ticket_url, cover_url, is_free, capacity, space_id, going_count, interested_count,
  rejection_reason, cancelled_at, city:cities(name), space:spaces(slug, name, emoji), host:profiles!events_host_id_fkey(${CARD})`;

const eventRow = z
  .object({
    id,
    host_id: id,
    created_by: id.nullable(),
    status: contentStatusSchema,
    title: z.string(),
    description: z.string(),
    category: eventCategorySchema,
    format: eventFormatSchema,
    starts_at: z.string(),
    ends_at: z.string().nullable(),
    timezone: z.string(),
    city_id: z.number().nullable(),
    venue_name: z.string().nullable(),
    address: z.string().nullable(),
    online_url: z.string().nullable(),
    ticket_url: z.string().nullable(),
    cover_url: z.string().nullable(),
    is_free: z.boolean(),
    capacity: z.number().nullable(),
    space_id: id.nullable(),
    going_count: z.number(),
    interested_count: z.number(),
    rejection_reason: z.string().nullable(),
    cancelled_at: z.string().nullable(),
    city: z.object({ name: z.string() }).nullable(),
    space: z.object({ slug: z.string(), name: z.string(), emoji: z.string().nullable() }).nullable(),
    host: profileCardSchema,
  })
  .transform((e) => ({
    id: e.id,
    hostId: e.host_id,
    review: review(e.status, e.rejection_reason),
    title: e.title,
    description: e.description,
    category: e.category,
    format: e.format,
    startsAt: e.starts_at,
    endsAt: e.ends_at,
    timezone: e.timezone,
    cityId: e.city_id,
    city: e.city?.name ?? null,
    venue: e.venue_name,
    address: e.address,
    onlineUrl: e.online_url,
    ticketUrl: e.ticket_url,
    coverUrl: e.cover_url,
    free: e.is_free,
    capacity: e.capacity,
    spaceId: e.space_id,
    space: e.space,
    going: e.going_count,
    interested: e.interested_count,
    cancelled: e.cancelled_at !== null,
    host: e.host,
  }));
export type CommunityEvent = z.infer<typeof eventRow>;

export type EventScope = { kind: "all" } | { kind: "online" } | { kind: "cities"; cityIds: number[] } | { kind: "space"; spaceId: string };

const SIX_HOURS = 6 * 60 * 60 * 1000;

export async function loadUpcomingEvents(scope: EventScope, category: EventCategory | null = null, limit = 50): Promise<CommunityEvent[]> {
  const supabase = await createClient();
  const now = Date.now();
  // Events without an end time count as running for six hours, like the RSVP check in the database.
  const upcoming = `ends_at.gte."${new Date(now).toISOString()}",and(ends_at.is.null,starts_at.gte."${new Date(now - SIX_HOURS).toISOString()}")`;
  const base = supabase.from("events").select(EVENT).eq("status", "published").is("cancelled_at", null).or(upcoming);
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

export const rsvpSchema = z.enum(["going", "interested"]);
export type RsvpStatus = z.infer<typeof rsvpSchema>;

export const loadEvent = cache(async (eventId: string, viewer: Viewer | null) => {
  if (!id.safeParse(eventId).success) return null;
  const supabase = await createClient();
  const [{ data: row }, { data: attendees }, mine] = await Promise.all([
    supabase.from("events").select(EVENT).eq("id", eventId).maybeSingle(),
    supabase.from("event_rsvps").select(`user:profiles(${CARD})`).eq("event_id", eventId).eq("status", "going").order("created_at").limit(12),
    viewer ? supabase.from("event_rsvps").select("status").eq("event_id", eventId).eq("user_id", viewer.id).maybeSingle() : null,
  ]);
  if (!row) return null;
  return {
    event: eventRow.parse(row),
    attendees: z
      .array(z.object({ user: profileCardSchema }))
      .parse(attendees ?? [])
      .map((rsvp) => rsvp.user),
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

const OPPORTUNITY = `id, poster_id, created_by, status, type, title, organisation_name, description, city_id, is_remote,
  location_text, apply_url, apply_email, deadline_at, compensation, rejection_reason, closed_at, created_at,
  city:cities(name), poster:profiles!opportunities_poster_id_fkey(${CARD})`;

const opportunityRow = z
  .object({
    id,
    poster_id: id,
    created_by: id.nullable(),
    status: contentStatusSchema,
    type: opportunityTypeSchema,
    title: z.string(),
    organisation_name: z.string().nullable(),
    description: z.string(),
    city_id: z.number().nullable(),
    is_remote: z.boolean(),
    location_text: z.string().nullable(),
    apply_url: z.string().nullable(),
    apply_email: z.string().nullable(),
    deadline_at: z.string().nullable(),
    compensation: z.string().nullable(),
    rejection_reason: z.string().nullable(),
    closed_at: z.string().nullable(),
    created_at: z.string(),
    city: z.object({ name: z.string() }).nullable(),
    poster: profileCardSchema,
  })
  .transform((o) => ({
    id: o.id,
    posterId: o.poster_id,
    review: review(o.status, o.rejection_reason),
    type: o.type,
    title: o.title,
    organisation: o.organisation_name,
    description: o.description,
    cityId: o.city_id,
    city: o.city?.name ?? null,
    remote: o.is_remote,
    location: o.location_text,
    applyUrl: o.apply_url,
    applyEmail: o.apply_email,
    deadlineAt: o.deadline_at,
    compensation: o.compensation,
    closed: o.closed_at !== null || (o.deadline_at !== null && Date.parse(o.deadline_at) < Date.now()),
    createdAt: o.created_at,
    poster: o.poster,
  }));
export type Opportunity = z.infer<typeof opportunityRow>;

export type OpportunityFilter = { type: OpportunityType | null; cityId: number | null; remote: boolean };

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
