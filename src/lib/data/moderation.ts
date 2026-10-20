import "server-only";
import { z } from "zod";
import { isReportReason, type ReportReason } from "@/lib/catalogue";
import { eventCategorySchema, eventFormatSchema } from "@/lib/data/community";
import { opportunityTypeSchema, parsePosts, profileCardSchema, type Post, type ProfileCard } from "@/lib/domain";
import { createClient, type Supabase } from "@/lib/supabase/server";

const id = z.uuid();
const reviewTarget = z.enum(["post", "event", "opportunity"]);
const reportTarget = z.enum(["post", "profile", "message", "event", "opportunity", "space"]);
export type ReviewTarget = z.infer<typeof reviewTarget>;
export type ReportTarget = z.infer<typeof reportTarget>;
const reason = z.custom<ReportReason>(isReportReason);

const CARD = "id, username, display_name, avatar_url, colour:effective_colour, account_type, org_verified, headline";
const QUEUE_SIZE = 50;

async function loadCards(supabase: Supabase, ids: (string | null)[]) {
  const wanted = [...new Set(ids.filter((value) => value !== null))];
  if (wanted.length === 0) return new Map<string, ProfileCard>();
  const { data } = await supabase.from("profiles").select(CARD).in("id", wanted);
  return new Map(z.array(profileCardSchema).parse(data ?? []).map((card) => [card.id, card]));
}

export type ParentContext = { kind: "post"; username: string; excerpt: string } | { kind: "gone" };
export type PostPreview = { post: Post; parent: ParentContext | null };

const EXCERPT_LENGTH = 120;

function excerpt(body: string) {
  const flat = body.replace(/\s+/g, " ").trim();
  return flat.length > EXCERPT_LENGTH ? `${flat.slice(0, EXCERPT_LENGTH - 1)}…` : flat;
}

const parentRows = z.array(z.object({ id, body: z.string(), author: profileCardSchema.nullable() }));

// post_details leaves out posts by people the moderator blocked, so a target can be missing here.
async function loadPostPreviews(supabase: Supabase, ids: string[]) {
  if (ids.length === 0) return new Map<string, PostPreview>();
  const { data, error } = await supabase.from("post_details").select("*").in("id", ids);
  if (error) throw new Error(`Post previews failed: ${error.message}`);
  const posts = parsePosts(data).flatMap((row) => (row.kind === "post" ? [row] : []));

  const parentIds = [...new Set(posts.flatMap((post) => (post.parentId ? [post.parentId] : [])))];
  const parents = new Map<string, ParentContext>();
  if (parentIds.length > 0) {
    const { data: rows } = await supabase.from("post_details").select("id, body, author").in("id", parentIds);
    for (const row of parentRows.parse(rows ?? [])) {
      parents.set(row.id, row.author ? { kind: "post", username: row.author.username, excerpt: excerpt(row.body) } : { kind: "gone" });
    }
  }

  return new Map(
    posts.map((post) => [post.id, { post, parent: post.parentId ? (parents.get(post.parentId) ?? { kind: "gone" }) : null }]),
  );
}

const reviewEventRow = z
  .object({
    id,
    title: z.string(),
    description: z.string(),
    category: eventCategorySchema,
    format: eventFormatSchema,
    starts_at: z.string(),
    ends_at: z.string().nullable(),
    timezone: z.string(),
    venue_name: z.string().nullable(),
    address: z.string().nullable(),
    online_url: z.string().nullable(),
    ticket_url: z.string().nullable(),
    cover_url: z.string().nullable(),
    is_free: z.boolean(),
    capacity: z.number().nullable(),
    city: z.object({ name: z.string() }).nullable(),
  })
  .transform((e) => ({
    id: e.id,
    title: e.title,
    description: e.description,
    category: e.category,
    format: e.format,
    startsAt: e.starts_at,
    endsAt: e.ends_at,
    timezone: e.timezone,
    place: [e.venue_name, e.address, e.city?.name].filter((part) => part !== null && part !== undefined).join(", "),
    onlineUrl: e.online_url,
    ticketUrl: e.ticket_url,
    coverUrl: e.cover_url,
    free: e.is_free,
    capacity: e.capacity,
  }));
export type ReviewEvent = z.infer<typeof reviewEventRow>;

const reviewOpportunityRow = z
  .object({
    id,
    type: opportunityTypeSchema,
    title: z.string(),
    organisation_name: z.string().nullable(),
    description: z.string(),
    is_remote: z.boolean(),
    location_text: z.string().nullable(),
    apply_url: z.string().nullable(),
    apply_email: z.string().nullable(),
    deadline_at: z.string().nullable(),
    compensation: z.string().nullable(),
    city: z.object({ name: z.string() }).nullable(),
  })
  .transform((o) => ({
    id: o.id,
    type: o.type,
    title: o.title,
    organisation: o.organisation_name,
    description: o.description,
    place: [o.is_remote ? "Remote" : null, o.location_text, o.city?.name].filter((part) => part !== null && part !== undefined).join(" · "),
    applyUrl: o.apply_url,
    applyEmail: o.apply_email,
    deadlineAt: o.deadline_at,
    compensation: o.compensation,
  }));
export type ReviewOpportunity = z.infer<typeof reviewOpportunityRow>;

const EVENT_COLUMNS = "id, title, description, category, format, starts_at, ends_at, timezone, venue_name, address, online_url, ticket_url, cover_url, is_free, capacity, city:cities(name)";
const OPPORTUNITY_COLUMNS = "id, type, title, organisation_name, description, is_remote, location_text, apply_url, apply_email, deadline_at, compensation, city:cities(name)";

async function loadListings(supabase: Supabase, eventIds: string[], opportunityIds: string[]) {
  const [events, opportunities] = await Promise.all([
    eventIds.length > 0 ? supabase.from("events").select(EVENT_COLUMNS).in("id", eventIds) : null,
    opportunityIds.length > 0 ? supabase.from("opportunities").select(OPPORTUNITY_COLUMNS).in("id", opportunityIds) : null,
  ]);
  return {
    events: new Map(z.array(reviewEventRow).parse(events?.data ?? []).map((event) => [event.id, event])),
    opportunities: new Map(z.array(reviewOpportunityRow).parse(opportunities?.data ?? []).map((opportunity) => [opportunity.id, opportunity])),
  };
}

const reviewRows = z.array(
  z.object({
    target_type: reviewTarget,
    target_id: id,
    profile_id: id.nullable(),
    content: z.string(),
    language: z.string(),
    note: z.string().nullable(),
    parent_id: id.nullable(),
    created_at: z.string(),
    flags: z.array(z.string()).nullable(),
  }),
);

// "text" covers a target whose full row the moderator can't read, so it is never approved blank.
export type ReviewSubject =
  | { kind: "post"; preview: PostPreview }
  | { kind: "event"; event: ReviewEvent }
  | { kind: "opportunity"; opportunity: ReviewOpportunity }
  | { kind: "text"; content: string };

export type ReviewItem = {
  targetType: ReviewTarget;
  targetId: string;
  reply: boolean;
  author: ProfileCard | null;
  language: string;
  note: string | null;
  // Categories the automatic check flagged, if it held this.
  flags: string[];
  createdAt: string;
  subject: ReviewSubject;
};

const idsOf = <T extends string>(rows: { target_type: T; target_id: string }[], type: T) =>
  rows.filter((row) => row.target_type === type).map((row) => row.target_id);

export async function loadReviewQueue(): Promise<ReviewItem[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("review_queue").select("*").order("created_at").limit(QUEUE_SIZE);
  if (error) throw new Error(`Review queue failed: ${error.message}`);
  const rows = reviewRows.parse(data ?? []);
  const [cards, previews, listings] = await Promise.all([
    loadCards(supabase, rows.map((row) => row.profile_id)),
    loadPostPreviews(supabase, idsOf(rows, "post")),
    loadListings(supabase, idsOf(rows, "event"), idsOf(rows, "opportunity")),
  ]);

  const subjectOf = (row: z.infer<typeof reviewRows>[number]): ReviewSubject => {
    const fallback = { kind: "text" as const, content: row.content };
    switch (row.target_type) {
      case "post": {
        const preview = previews.get(row.target_id);
        return preview ? { kind: "post", preview } : fallback;
      }
      case "event": {
        const event = listings.events.get(row.target_id);
        return event ? { kind: "event", event } : fallback;
      }
      case "opportunity": {
        const opportunity = listings.opportunities.get(row.target_id);
        return opportunity ? { kind: "opportunity", opportunity } : fallback;
      }
      default: {
        const exhaustive: never = row.target_type;
        return exhaustive;
      }
    }
  };

  return rows.map((row) => ({
    targetType: row.target_type,
    targetId: row.target_id,
    reply: row.parent_id !== null,
    author: row.profile_id ? (cards.get(row.profile_id) ?? null) : null,
    language: row.language,
    note: row.note,
    flags: row.flags ?? [],
    createdAt: row.created_at,
    subject: subjectOf(row),
  }));
}

const reportRows = z.array(
  z.object({
    target_type: reportTarget,
    target_id: id,
    target_profile_id: id.nullable(),
    report_count: z.number(),
    first_reported_at: z.string(),
    reasons: z.array(reason),
    snapshot: z.string().nullable(),
    reports: z.array(z.object({ reason, details: z.string().nullable(), contact: z.string().nullable(), created_at: z.string() })),
    respond_by: z.string().nullable(),
  }),
);

export type ReportGroup = {
  targetType: ReportTarget;
  targetId: string;
  profile: ProfileCard | null;
  count: number;
  firstReportedAt: string;
  reasons: ReportReason[];
  snapshot: string | null;
  preview: PostPreview | null;
  reports: { reason: ReportReason; details: string | null; contact: string | null; createdAt: string }[];
  // Legal complaints: terms, section 7 promises action within 7 days.
  respondBy: string | null;
  href: string | null;
};

const visibleIds = (rows: unknown) => new Set(z.array(z.object({ id })).parse(rows ?? []).map((row) => row.id));

// Moderators can read pending and rejected content too, so a link is only
// offered when the content is public right now.
async function publicLinks(supabase: Supabase, groups: z.infer<typeof reportRows>, cards: Map<string, ProfileCard>, previews: Map<string, PostPreview>) {
  const [events, opportunities, spaces] = await Promise.all([
    supabase.from("events").select("id").in("id", idsOf(groups, "event")).eq("status", "published"),
    supabase.from("opportunities").select("id").in("id", idsOf(groups, "opportunity")).eq("status", "published"),
    supabase.from("spaces").select("id, slug").in("id", idsOf(groups, "space")),
  ]);
  const live = { event: visibleIds(events.data), opportunity: visibleIds(opportunities.data) };
  const spaceSlugs = new Map(z.array(z.object({ id, slug: z.string() })).parse(spaces.data ?? []).map((row) => [row.id, row.slug]));

  return (group: z.infer<typeof reportRows>[number]): string | null => {
    const username = group.target_profile_id ? cards.get(group.target_profile_id)?.username : undefined;
    switch (group.target_type) {
      case "post": {
        const post = previews.get(group.target_id)?.post;
        return post?.status === "published" ? `/@${post.author.username}/posts/${post.id}` : null;
      }
      case "profile":
        return username ? `/@${username}` : null;
      case "event":
        return live.event.has(group.target_id) ? `/events/${group.target_id}` : null;
      case "opportunity":
        return live.opportunity.has(group.target_id) ? `/opportunities/${group.target_id}` : null;
      case "space": {
        const slug = spaceSlugs.get(group.target_id);
        return slug ? `/spaces/${slug}` : null;
      }
      case "message":
        return null;
      default: {
        const exhaustive: never = group.target_type;
        return exhaustive;
      }
    }
  };
}

export async function loadReportQueue(): Promise<ReportGroup[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("report_queue").select("*").order("first_reported_at").limit(QUEUE_SIZE);
  if (error) throw new Error(`Report queue failed: ${error.message}`);
  const groups = reportRows.parse(data ?? []);
  const [cards, previews] = await Promise.all([
    loadCards(supabase, groups.map((group) => group.target_profile_id)),
    loadPostPreviews(supabase, idsOf(groups, "post")),
  ]);
  const linkFor = await publicLinks(supabase, groups, cards, previews);
  return groups.map((group) => ({
    targetType: group.target_type,
    targetId: group.target_id,
    profile: group.target_profile_id ? (cards.get(group.target_profile_id) ?? null) : null,
    count: group.report_count,
    firstReportedAt: group.first_reported_at,
    reasons: group.reasons,
    snapshot: group.snapshot,
    preview: group.target_type === "post" ? (previews.get(group.target_id) ?? null) : null,
    reports: group.reports.map((report) => ({ reason: report.reason, details: report.details, contact: report.contact, createdAt: report.created_at })),
    respondBy: group.respond_by,
    href: linkFor(group),
  }));
}

const siteSettingsRow = z.object({ premoderation: z.boolean(), translations: z.boolean() });
export type SiteSettings = z.infer<typeof siteSettingsRow>;

export async function loadSiteSettings(): Promise<SiteSettings> {
  const supabase = await createClient();
  const { data } = await supabase.from("site_settings").select("premoderation, translations").single();
  return siteSettingsRow.parse(data);
}
