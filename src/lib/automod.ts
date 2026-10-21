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

// The text goes with the first image; every other image is checked on its
// own, as a request is only documented to take one.
export function moderationInputs(text: string, images: string[]): Part[][] {
  const pictures = images.map((url): Part => ({ type: "image_url", image_url: { url } }));
  if (!text) return pictures.map((picture) => [picture]);
  const [first, ...rest] = pictures;
  return [[{ type: "text", text }, ...(first ? [first] : [])], ...rest.map((picture) => [picture])];
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

export type CheckTarget = "post" | "event" | "opportunity";
export type CheckOutcome = { kind: "done" } | { kind: "retry"; reason: string };

// Runs from the background task the database queues when a post, event or
// opportunity from someone without a track record is created. A flag takes it
// back to review with its categories. It never rejects: the models are weaker
// in Swahili, Somali and Amharic, so a person decides. Without both keys it
// does nothing.
export async function checkContent(target: CheckTarget, targetId: string): Promise<CheckOutcome> {
  const key = serverEnv.OPENAI_API_KEY;
  const service = createServiceClient();
  if (!key || !service) return { kind: "done" };

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
