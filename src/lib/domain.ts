import { z } from "zod";

// Rows arrive from Supabase as untyped JSON. These schemas parse them once into
// the shapes the app uses; nothing past this file re-checks them.

const timestamp = z.string();
const id = z.uuid();

export const colourSchema = z.number().int().min(0).max(5);
export type Colour = z.infer<typeof colourSchema>;

export const accountTypeSchema = z.enum(["person", "organisation"]);
export type AccountType = z.infer<typeof accountTypeSchema>;

export const contentStatusSchema = z.enum(["pending", "published", "rejected"]);
export type ContentStatus = z.infer<typeof contentStatusSchema>;

export const profileCardSchema = z
  .object({
    id,
    username: z.string(),
    display_name: z.string(),
    avatar_url: z.string().nullable(),
    colour: colourSchema,
    account_type: accountTypeSchema,
    org_verified: z.boolean(),
    headline: z.string().nullable().optional(),
    city: z.string().nullable().optional(),
  })
  .transform((p) => ({
    id: p.id,
    username: p.username,
    displayName: p.display_name,
    avatarUrl: p.avatar_url,
    colour: p.colour,
    accountType: p.account_type,
    verified: p.org_verified,
    headline: p.headline ?? null,
    city: p.city ?? null,
  }));
export type ProfileCard = z.infer<typeof profileCardSchema>;

const imageSchema = z.object({
  id,
  url: z.string(),
  width: z.number().nullable(),
  height: z.number().nullable(),
  alt: z.string(),
});
export type PostImage = z.infer<typeof imageSchema>;

const pollSchema = z
  .object({
    closes_at: timestamp.nullable(),
    duration_hours: z.number(),
    votes_count: z.number(),
    my_vote: id.nullable(),
    show_results: z.boolean(),
    options: z.array(z.object({ id, label: z.string(), votes_count: z.number().nullable() })),
  })
  .transform((p) => ({
    closesAt: p.closes_at,
    durationHours: p.duration_hours,
    votes: p.votes_count,
    myVote: p.my_vote,
    showResults: p.show_results,
    options: p.options.map((o) => ({ id: o.id, label: o.label, votes: o.votes_count })),
  }));
export type Poll = z.infer<typeof pollSchema>;

const quotedSchema = z.union([
  z.object({ id, deleted: z.literal(true) }).transform((q) => ({ kind: "deleted" as const, id: q.id })),
  z.object({ id, unavailable: z.literal(true) }).transform((q) => ({ kind: "unavailable" as const, id: q.id })),
  z
    .object({
      id,
      body: z.string(),
      created_at: timestamp,
      language: z.string(),
      author: profileCardSchema.nullable(),
      image: z.object({ url: z.string(), alt: z.string() }).nullable(),
    })
    .transform((q) =>
      q.author
        ? { kind: "post" as const, id: q.id, body: q.body, createdAt: q.created_at, author: q.author, image: q.image }
        : { kind: "deleted" as const, id: q.id },
    ),
]);
export type QuotedPost = z.infer<typeof quotedSchema>;

const linkPreviewSchema = z
  .object({
    url: z.string(),
    title: z.string().nullish(),
    description: z.string().nullish(),
    image: z.string().nullish(),
    site_name: z.string().nullish(),
  })
  .transform((l) => ({
    url: l.url,
    title: l.title ?? null,
    description: l.description ?? null,
    image: l.image ?? null,
    siteName: l.site_name ?? null,
  }));
export type LinkPreview = z.infer<typeof linkPreviewSchema>;

const eventSummarySchema = z
  .object({
    id,
    title: z.string(),
    starts_at: timestamp,
    timezone: z.string(),
    format: z.enum(["in_person", "online", "hybrid"]),
    venue_name: z.string().nullable(),
    city: z.string().nullable(),
    going_count: z.number(),
    cancelled: z.boolean(),
  })
  .transform((e) => ({
    id: e.id,
    title: e.title,
    startsAt: e.starts_at,
    timezone: e.timezone,
    format: e.format,
    venue: e.venue_name,
    city: e.city,
    going: e.going_count,
    cancelled: e.cancelled,
  }));
export type EventSummary = z.infer<typeof eventSummarySchema>;

export const opportunityTypeSchema = z.enum([
  "job",
  "internship",
  "scholarship",
  "grant",
  "mentoring",
  "business",
  "volunteering",
]);
export type OpportunityType = z.infer<typeof opportunityTypeSchema>;

const opportunitySummarySchema = z
  .object({
    id,
    title: z.string(),
    type: opportunityTypeSchema,
    organisation_name: z.string().nullable(),
    deadline_at: timestamp.nullable(),
    is_remote: z.boolean(),
    city: z.string().nullable(),
    closed: z.boolean(),
  })
  .transform((o) => ({
    id: o.id,
    title: o.title,
    type: o.type,
    organisation: o.organisation_name,
    deadlineAt: o.deadline_at,
    remote: o.is_remote,
    city: o.city,
    closed: o.closed,
  }));
export type OpportunitySummary = z.infer<typeof opportunitySummarySchema>;

export const postRowSchema = z
  .object({
    id,
    author_id: id.nullable(),
    created_by: id.nullable(),
    status: contentStatusSchema,
    body: z.string(),
    language: z.string(),
    parent_id: id.nullable(),
    root_id: id.nullable(),
    quote_id: id.nullable(),
    link_url: z.string().nullable(),
    link_preview: linkPreviewSchema.nullable().catch(null),
    moderation_note: z.string().nullable(),
    reply_count: z.number(),
    like_count: z.number(),
    quote_count: z.number(),
    deleted_at: timestamp.nullable(),
    created_at: timestamp,
    author: profileCardSchema.nullable(),
    author_muted: z.boolean(),
    parent_username: z.string().nullable(),
    images: z.array(imageSchema),
    poll: pollSchema.nullable(),
    quoted: quotedSchema.nullable(),
    event: eventSummarySchema.nullable(),
    opportunity: opportunitySummarySchema.nullable(),
    space: z.object({ slug: z.string(), name: z.string(), emoji: z.string().nullable() }).nullable(),
    liked: z.boolean(),
    saved: z.boolean(),
    translation: z.string().nullable(),
    continuation_count: z.number(),
  })
  .transform((r) => {
    // The post that continues this one is read as part of its thread, not as a reply.
    const replies = Math.max(r.reply_count - (r.continuation_count > 0 ? 1 : 0), 0);
    const thread = { id: r.id, parentId: r.parent_id, rootId: r.root_id, replies, createdAt: r.created_at };
    if (r.deleted_at || !r.author || !r.author_id) return { kind: "tombstone" as const, ...thread };
    return {
      kind: "post" as const,
      ...thread,
      authorId: r.author_id,
      createdBy: r.created_by,
      status: r.status,
      moderationNote: r.moderation_note,
      body: r.body,
      language: r.language,
      quoteId: r.quote_id,
      parentUsername: r.parent_username,
      linkUrl: r.link_url,
      linkPreview: r.link_preview,
      likes: r.like_count,
      quotes: r.quote_count,
      author: r.author,
      authorMuted: r.author_muted,
      images: r.images,
      poll: r.poll,
      quoted: r.quoted,
      event: r.event,
      opportunity: r.opportunity,
      space: r.space,
      liked: r.liked,
      saved: r.saved,
      translation: r.translation,
      continuation: r.continuation_count,
    };
  });
export type PostRow = z.infer<typeof postRowSchema>;
export type Post = Extract<PostRow, { kind: "post" }>;
export type Tombstone = Extract<PostRow, { kind: "tombstone" }>;

export const parsePosts = (rows: unknown) => z.array(postRowSchema).parse(rows ?? []);

// Where a post sits in a thread its author continued by replying to themselves.
// A capped thread is longer than the size shown.
export type ThreadPlace = { position: number; size: number; capped: boolean };

export const suggestionSchema = z
  .object({
    id,
    username: z.string(),
    display_name: z.string(),
    avatar_url: z.string().nullable(),
    colour: colourSchema,
    bio: z.string(),
    headline: z.string().nullable(),
    account_type: accountTypeSchema,
    org_verified: z.boolean(),
    followers_count: z.number(),
    city: z.string().nullable().optional(),
    follows_you: z.boolean().optional(),
    following: z.boolean().optional(),
    reason: z.string().optional(),
    distance_band: z.string().optional(),
  })
  .transform((p) => ({
    id: p.id,
    username: p.username,
    displayName: p.display_name,
    avatarUrl: p.avatar_url,
    colour: p.colour,
    bio: p.bio,
    headline: p.headline,
    accountType: p.account_type,
    verified: p.org_verified,
    followers: p.followers_count,
    city: p.city ?? null,
    followsYou: p.follows_you ?? false,
    following: p.following ?? false,
    reason: p.reason ?? p.distance_band ?? null,
  }));
export type PersonSummary = z.infer<typeof suggestionSchema>;
export const parsePeople = (rows: unknown) => z.array(suggestionSchema).parse(rows ?? []);

export const CITY_PHOTO_COLUMNS = "photo_url, photo_thumb_url, photo_author, photo_license, photo_license_url, photo_source_url";

// A city's photo, with the credit its licence requires. Null when the city has none.
export const cityPhotoSchema = z
  .object({
    photo_url: z.string().nullable(),
    photo_thumb_url: z.string().nullable(),
    photo_author: z.string().nullable(),
    photo_license: z.string().nullable(),
    photo_license_url: z.string().nullable(),
    photo_source_url: z.string().nullable(),
  })
  .nullable()
  .transform((c) =>
    c?.photo_url && c.photo_thumb_url && c.photo_author && c.photo_license && c.photo_source_url
      ? { url: c.photo_url, thumbUrl: c.photo_thumb_url, author: c.photo_author, license: c.photo_license, licenseUrl: c.photo_license_url, sourceUrl: c.photo_source_url }
      : null,
  );
export type CityPhoto = NonNullable<z.infer<typeof cityPhotoSchema>>;
