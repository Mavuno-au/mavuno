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

// A failed request flags nothing.
async function moderate(key: string, input: Part[]): Promise<string[]> {
  const response = await fetch("https://api.openai.com/v1/moderations", {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({ model: MODEL, input }),
    signal: AbortSignal.timeout(15_000),
  }).catch(() => null);
  const parsed = moderationResponse.safeParse(await response?.json().catch(() => null));
  return response?.ok && parsed.success ? flaggedCategories(parsed.data.results) : [];
}

// Runs after a post is created. Posts from members without a track record go
// to OpenAI; a flag takes the post back to review with its categories. It
// never rejects: the models are weaker in Swahili, Somali and Amharic, so a
// person decides. Without both keys it does nothing.
export async function checkPost(postId: string) {
  const key = serverEnv.OPENAI_API_KEY;
  const service = createServiceClient();
  if (!key || !service) return;

  const { data } = await service.rpc("automatic_check_subject", { p_post_id: postId });
  const subject = subjectSchema.safeParse(data);
  if (!subject.success) return;

  const results = await Promise.all(moderationInputs(subject.data.text, subject.data.images).map((input) => moderate(key, input)));
  const categories = [...new Set(results.flat())].sort();
  if (categories.length > 0) await service.rpc("automatic_hold", { p_post_id: postId, p_categories: categories });
}
