import "server-only";
import { z } from "zod";
import { serverEnv } from "@/lib/server-env";
import { createServiceClient } from "@/lib/supabase/server";

const MODEL = "omni-moderation-latest";
// Far stricter than OpenAI's own cut-off: a flag only means a moderator looks.
const THRESHOLD = 0.2;
const THRESHOLDS: Record<string, number> = { "sexual/minors": 0.01 };

const moderationResponse = z.object({
  results: z.array(z.object({ categories: z.record(z.string(), z.unknown()), category_scores: z.record(z.string(), z.number()) })),
});
export type ModerationResults = z.infer<typeof moderationResponse>["results"];

const subjectSchema = z.object({ text: z.string(), images: z.array(z.url()) });

// Categories OpenAI flags, and those scoring at least our own threshold.
export function flaggedCategories(results: ModerationResults): string[] {
  const flagged = new Set<string>();
  for (const result of results) {
    for (const [category, score] of Object.entries(result.category_scores)) {
      if (result.categories[category] === true || score >= (THRESHOLDS[category] ?? THRESHOLD)) flagged.add(category);
    }
  }
  return [...flagged].sort();
}

type Part = { type: "text"; text: string } | { type: "image_url"; image_url: { url: string } };

// The text and each image go on their own (a request is only documented to
// take one image). An image the service can't fetch, such as a link card's
// picture on a site the poster controls, then can't stop the text being checked.
export function moderationInputs(text: string, images: string[]): Part[][] {
  const pictures = images.map((url): Part[] => [{ type: "image_url", image_url: { url } }]);
  return text ? [[{ type: "text", text }], ...pictures] : pictures;
}

// Null when the request failed, so the check can be tried again.
async function moderate(key: string, input: Part[]): Promise<string[] | null> {
  const response = await fetch("https://api.openai.com/v1/moderations", {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({ model: MODEL, input }),
    signal: AbortSignal.timeout(15_000),
  }).catch(() => null);
  const parsed = moderationResponse.safeParse(await response?.json().catch(() => null));
  return response?.ok && parsed.success ? flaggedCategories(parsed.data.results) : null;
}

export type CheckTarget = "post" | "event" | "opportunity" | "profile" | "space";
export type CheckOutcome = { kind: "done" } | { kind: "retry"; reason: string };

// Runs from the background task the database queues when someone without a
// track record creates a post, event or opportunity, or changes a profile or
// space. A flag takes a post or listing back to review, and puts a profile or
// space in the reports, with its categories. It never rejects: the models are
// weaker in Swahili, Somali and Amharic, so a person decides. Without its keys
// the task fails, so Health shows it, rather than passing everything.
export async function checkContent(target: CheckTarget, targetId: string): Promise<CheckOutcome> {
  const key = serverEnv.OPENAI_API_KEY;
  const service = createServiceClient();
  if (!key || !service) return { kind: "retry", reason: "The automatic check needs OPENAI_API_KEY and SUPABASE_SERVICE_ROLE_KEY" };

  const { data, error } = await service.rpc("automatic_check_subject", { p_target_type: target, p_target_id: targetId });
  if (error) return { kind: "retry", reason: error.message };
  const subject = subjectSchema.safeParse(data);
  if (!subject.success) return { kind: "done" };

  const results = await Promise.all(moderationInputs(subject.data.text, subject.data.images).map((input) => moderate(key, input)));
  const categories = [...new Set(results.flatMap((result) => result ?? []))].sort();
  // Whatever was flagged is held now; a person looks at it either way.
  if (categories.length > 0) {
    const held = await service.rpc("automatic_hold", { p_target_type: target, p_target_id: targetId, p_categories: categories });
    return held.error ? { kind: "retry", reason: held.error.message } : { kind: "done" };
  }
  return results.includes(null) ? { kind: "retry", reason: "The moderation service did not answer" } : { kind: "done" };
}
