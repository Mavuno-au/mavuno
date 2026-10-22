import { z } from "zod";
import { LIMITS, POLL_DURATIONS } from "@/lib/catalogue";
import { allUrls } from "@/lib/text";

// What a new post may hold, as the website's server actions and the app check
// it before `create_post` and `schedule_post`. The database checks it again.

const id = z.uuid();

// The public address of the project's media bucket. Only the caller knows the
// project, so the schemas take it rather than reading the environment.
export const mediaBucketUrl = (supabaseUrl: string) => `${new URL(supabaseUrl).origin}/storage/v1/object/public/media/`;

export const POLL_OPTIONS = { min: 2, max: 4 } as const;

const pollDuration = z.union(POLL_DURATIONS.map((duration) => z.literal(duration.hours)));

export function postSchemas(media: string) {
  const newPost = z.object({
    body: z.string().max(LIMITS.postBody),
    language: z.string().regex(/^[a-z]{2,3}$/),
    authorId: id.nullable(),
    parentId: id.nullable(),
    quoteId: id.nullable(),
    spaceId: id.nullable(),
    eventId: id.nullable(),
    opportunityId: id.nullable(),
    linkUrl: z.url().nullable(),
    images: z
      .array(
        z
          .object({ path: z.string().max(300), url: z.url(), width: z.number().int().positive(), height: z.number().int().positive(), alt: z.string().max(LIMITS.imageAlt) })
          // The database checks the path; only here is the project's own storage host known.
          .refine((image) => image.url === `${media}${image.path}`),
      )
      .max(LIMITS.images),
    poll: z
      .object({ options: z.array(z.string().trim().min(1).max(LIMITS.pollOption)).min(POLL_OPTIONS.min).max(POLL_OPTIONS.max), durationHours: pollDuration })
      .nullable(),
  });
  // Scheduled posts are top-level posts, published later by the database.
  const scheduled = newPost
    .pick({ body: true, language: true, authorId: true, spaceId: true, linkUrl: true, images: true, poll: true })
    .extend({ scheduledAt: z.iso.datetime({ offset: true }) });
  return { newPost, scheduled };
}

type Schemas = ReturnType<typeof postSchemas>;
export type NewPost = z.input<Schemas["newPost"]>;
export type NewScheduledPost = z.input<Schemas["scheduled"]>;

// Only a link that is in the post can become its card. The server fetches the
// card after the post is created.
export function cardLink(body: string, linkUrl: string | null) {
  return linkUrl && allUrls(body).includes(linkUrl) ? linkUrl : null;
}

export const pollArgument = (poll: z.infer<Schemas["newPost"]>["poll"]) => poll && { options: poll.options, duration_hours: poll.durationHours };
