import { z } from "zod";
import { AU_TIMEZONES, EVENT_CATEGORIES, EVENT_FORMATS, type EventCategory } from "@/lib/catalogue";
import { httpsUrl, withoutNul } from "@/lib/schemas";
import { CITY_PHOTO_COLUMNS, cityPhotoSchema, contentStatusSchema, opportunityTypeSchema, profileCardSchema, type ContentStatus, type OpportunityType } from "@/lib/domain";

// Spaces, events and opportunities: their columns, rows and rules, shared by
// the website's loaders (src/lib/data/community.ts) and the app.

const id = z.uuid();
export const CARD = "id, username, display_name, avatar_url, colour:effective_colour, account_type, org_verified, headline";
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

export const SPACE = `id, slug, name, description, kind, city_id, emoji, is_official, members_count, posts_count, last_post_at, city:cities(${CITY_PHOTO_COLUMNS})`;

export const spaceKindSchema = z.enum(["city", "interest"]);
export type SpaceKind = z.infer<typeof spaceKindSchema>;
export const spaceRoleSchema = z.enum(["owner", "moderator", "member"]);
export type SpaceRole = z.infer<typeof spaceRoleSchema>;

export const spaceRow = z
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

export type SpaceTab = SpaceKind | "joined";

// Addresses under /spaces that are pages, not spaces. Mirrored by a check on
// public.spaces.slug.
export const RESERVED_SPACE_SLUGS = ["new", "interests", "joined"] as const;

export const EVENT = `id, host_id, created_by, status, title, description, category, format, starts_at, ends_at, timezone, city_id,
  venue_name, address, ticket_url, cover_url, is_free, capacity, space_id, going_count, interested_count,
  rejection_reason, cancelled_at, city:cities(name), space:spaces(slug, name, emoji), host:profiles!events_host_id_fkey(${CARD})`;

export const eventRow = z
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
    // Not selected: only event_online_url hands it out, to the host's team and people going.
    online_url: z.string().nullable().default(null),
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

// Events without an end time count as running for six hours, like the RSVP check in the database.
export const upcomingFilter = (now: number) => `ends_at.gte."${new Date(now).toISOString()}",and(ends_at.is.null,starts_at.gte."${new Date(now - SIX_HOURS).toISOString()}")`;

export const rsvpSchema = z.enum(["going", "interested"]);
export type RsvpStatus = z.infer<typeof rsvpSchema>;

export const OPPORTUNITY = `id, poster_id, created_by, status, type, title, organisation_name, description, city_id, is_remote,
  location_text, apply_url, apply_email, deadline_at, compensation, rejection_reason, closed_at, created_at,
  city:cities(name), poster:profiles!opportunities_poster_id_fkey(${CARD})`;

export const opportunityRow = z
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

export const savedListingRow = z.object({ id, status: contentStatusSchema });

// The forms, as the website's server actions and the app check them. Each
// takes the form's fields as text, the way a FormData sends them.

// A real date and time: "2026-02-30T10:00" would roll over to March, and a
// value Date can't read would throw inside the form's transform.
export const localTimeSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "Choose a date and time.")
  .refine((value) => {
    const parsed = new Date(`${value}:00Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 16) === value;
  }, "Choose a date and time.");

// `media` is the public address of the project's media bucket, which only the
// caller knows; a cover from anywhere else is refused.
export const eventFormSchema = (media: string) =>
  z
    .object({
      title: z.string().trim().min(3, "Give your event a title of at least 3 characters.").max(120, "Keep the title to 120 characters.").transform(withoutNul),
      description: z.string().trim().max(4000, "Keep the description to 4,000 characters.").transform(withoutNul),
      category: eventCategorySchema,
      format: eventFormatSchema,
      timezone: timezoneSchema,
      startsAt: localTimeSchema,
      endsAt: z.union([z.literal(""), localTimeSchema]).optional(),
      cityId: formField.number(1, 32767, "Choose a city from the list."),
      venue: formField.text(120, "Keep the venue name to 120 characters."),
      address: formField.text(200, "Keep the address to 200 characters."),
      onlineUrl: httpsUrl.optional(),
      ticketUrl: httpsUrl,
      coverUrl: formField.text(500, "Upload the cover image again.").refine((url) => url === null || url.startsWith(media), "Upload the cover image again."),
      free: formField.checkbox,
      capacity: formField.number(1, 100000, "Capacity is a number from 1 to 100,000."),
      spaceId: formField.text(36, "Choose a space from the list.").pipe(id.nullable()),
    })
    .refine((event) => event.format === "online" || event.cityId !== null, { message: "Choose the city it's in.", path: ["cityId"] })
    .refine((event) => event.format === "in_person" || Boolean(event.onlineUrl), { message: "Add the link people use to join online.", path: ["onlineUrl"] })
    .refine((event) => !event.endsAt || event.endsAt > event.startsAt, { message: "The end has to be after the start.", path: ["endsAt"] })
    .transform((event) => ({
      title: event.title,
      description: event.description,
      category: event.category,
      format: event.format,
      timezone: event.timezone,
      starts_at: fromZonedInput(event.startsAt, event.timezone),
      ends_at: event.endsAt ? fromZonedInput(event.endsAt, event.timezone) : null,
      city_id: event.cityId,
      venue_name: event.format === "online" ? null : event.venue,
      address: event.format === "online" ? null : event.address,
      online_url: event.format === "in_person" ? null : (event.onlineUrl ?? null),
      ticket_url: event.ticketUrl,
      cover_url: event.coverUrl,
      is_free: event.free,
      capacity: event.capacity,
      space_id: event.spaceId,
    }));

export const opportunityFormSchema = z
  .object({
    type: opportunityTypeSchema,
    title: z.string().trim().min(3, "Give it a title of at least 3 characters.").max(120, "Keep the title to 120 characters.").transform(withoutNul),
    organisation: formField.text(120, "Keep the organisation name to 120 characters."),
    description: z.string().trim().min(10, "Describe the opportunity in at least 10 characters.").max(6000, "Keep the description to 6,000 characters.").transform(withoutNul),
    cityId: formField.number(1, 32767, "Choose a city from the list."),
    remote: formField.checkbox,
    location: formField.text(120, "Keep the location to 120 characters."),
    applyUrl: httpsUrl,
    applyEmail: z.union([z.literal(""), z.email("Enter a valid email address.").max(200)]).transform((email) => email || null),
    deadline: z.union([z.literal(""), z.iso.date("Choose a valid deadline.")]),
    compensation: formField.text(120, "Keep the pay or value to 120 characters."),
  })
  .refine((o) => o.applyUrl !== null || o.applyEmail !== null, { message: "Add a link or an email address for applications.", path: ["applyUrl"] })
  .transform((o) => ({
    type: o.type,
    title: o.title,
    organisation_name: o.organisation,
    description: o.description,
    city_id: o.cityId,
    is_remote: o.remote,
    location_text: o.location,
    apply_url: o.applyUrl,
    apply_email: o.applyEmail,
    deadline_at: o.deadline ? fromZonedInput(`${o.deadline}T23:59`, DEADLINE_ZONE) : null,
    compensation: o.compensation,
  }));

export const newSpaceSchema = z
  .object({
    name: z.string().trim().min(2, "Give the space a name of at least 2 characters.").max(60, "Keep the name to 60 characters.").transform(withoutNul),
    slug: z
      .string()
      .trim()
      .toLowerCase()
      .regex(/^[a-z0-9-]{2,40}$/, "Use 2 to 40 lowercase letters, numbers or dashes for the address.")
      .refine((slug) => !RESERVED_SPACE_SLUGS.some((reserved) => reserved === slug), "That address is taken."),
    description: z.string().trim().max(500, "Keep the description to 500 characters.").transform(withoutNul),
    kind: spaceKindSchema,
    cityId: formField.number(1, 32767, "Choose a city from the list."),
    emoji: z.string().trim().max(16, "Use one emoji."),
  })
  .refine((space) => space.kind !== "city" || space.cityId !== null, { message: "Choose the city this space is for.", path: ["cityId"] });


// Where an opportunity is, in one line: "Sydney or remote" when it's both.
export function opportunityPlace(opportunity: Pick<Opportunity, "remote" | "city" | "location">) {
  const place = [opportunity.location, opportunity.city].filter(Boolean).join(", ");
  if (!opportunity.remote) return place || "Australia";
  return place ? `${place} or remote` : "Remote";
}

// Where an event is, in one line, as rows and the event page show it.
export function eventPlace(event: Pick<CommunityEvent, "format" | "venue" | "city">) {
  const physical = [event.venue, event.city].filter(Boolean).join(", ");
  switch (event.format) {
    case "online":
      return "Online";
    case "in_person":
      return physical;
    case "hybrid":
      return physical ? `${physical} and online` : "Online";
    default: {
      const exhaustive: never = event.format;
      return exhaustive;
    }
  }
}
