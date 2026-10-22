import { z } from "zod";
import { accountTypeSchema, contentStatusSchema } from "@/lib/domain";
import { friendlyError } from "@/lib/result";

// Scheduled posts and what became of each, for the website's Scheduled page
// and the app's.

export const SCHEDULED_LIMIT = 50;

export const SCHEDULED_SELECT =
  "id, body, images, poll, link_url, scheduled_at, submitted_at, error, error_code, author:profiles!scheduled_posts_author_id_fkey(username, display_name, account_type), post:posts(id, status, deleted_at)";

export const scheduledRow = z
  .object({
    id: z.uuid(),
    body: z.string(),
    images: z.array(z.unknown()),
    poll: z.object({ options: z.array(z.string()) }).nullable().catch(null),
    link_url: z.string().nullable(),
    scheduled_at: z.string(),
    submitted_at: z.string().nullable(),
    error: z.string().nullable(),
    error_code: z.string().nullable(),
    author: z.object({ username: z.string(), display_name: z.string(), account_type: accountTypeSchema }),
    post: z.object({ id: z.uuid(), status: contentStatusSchema, deleted_at: z.string().nullable() }).nullable(),
  })
  .transform((row) => ({
    id: row.id,
    scheduledAt: row.scheduled_at,
    body: row.body,
    imageCount: row.images.length,
    pollOptions: row.poll?.options ?? null,
    linkUrl: row.link_url,
    author: { username: row.author.username, displayName: row.author.display_name, accountType: row.author.account_type },
    outcome: outcome(row),
  }));

export type ScheduledOutcome =
  | { kind: "queued" }
  | { kind: "failed"; reason: string }
  | { kind: "posted"; postId: string; status: z.infer<typeof contentStatusSchema> }
  | { kind: "deleted" };

function outcome(row: {
  submitted_at: string | null;
  error: string | null;
  error_code: string | null;
  post: { id: string; status: z.infer<typeof contentStatusSchema>; deleted_at: string | null } | null;
}): ScheduledOutcome {
  if (row.submitted_at === null) return { kind: "queued" };
  if (row.error !== null) return { kind: "failed", reason: friendlyError({ code: row.error_code ?? undefined, message: row.error }) };
  // Erased posts lose their author, so the member can no longer read them.
  if (row.post === null || row.post.deleted_at !== null) return { kind: "deleted" };
  return { kind: "posted", postId: row.post.id, status: row.post.status };
}

export type ScheduledPost = z.infer<typeof scheduledRow>;

