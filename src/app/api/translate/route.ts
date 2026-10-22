import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { allow } from "@/lib/rate-limit";
import { serverEnv } from "@/lib/server-env";
import { createServiceClient } from "@/lib/supabase/server";
import { getRequestViewer, isModerator } from "@/lib/viewer";

const requestSchema = z.object({ postId: z.uuid(), target: z.string().regex(/^[a-z]{2,3}$/) });
const providerResponse = z.object({ translatedText: z.string() });

export async function POST(request: NextRequest) {
  const { supabase, viewer } = await getRequestViewer(request);
  if (!viewer) return NextResponse.json({ error: "Sign in to translate" }, { status: 401 });

  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Bad request" }, { status: 400 });
  const target = viewer.translationLanguage ?? parsed.data.target;

  const [{ data: settings }, { data: post }] = await Promise.all([
    supabase.from("site_settings").select("translations").single(),
    supabase.from("posts").select("id, body, language, status, deleted_at").eq("id", parsed.data.postId).maybeSingle(),
  ]);
  if (!settings?.translations) return NextResponse.json({ error: "Translations are off" }, { status: 404 });
  // Moderators read pending and held posts in their queues, often in a language they don't speak.
  const readable = post?.status === "published" || (post?.status === "pending" && isModerator(viewer));
  if (!post || post.deleted_at || !readable || !post.body) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { data: cached } = await supabase
    .from("post_translations")
    .select("body")
    .eq("post_id", post.id)
    .eq("target_language", target)
    .maybeSingle();
  if (cached) return NextResponse.json({ text: cached.body });

  if (!serverEnv.TRANSLATE_API_URL) return NextResponse.json({ error: "No translation provider" }, { status: 501 });
  if (!allow(`translate:${viewer.id}`, 10, 60_000)) return NextResponse.json({ error: "Slow down" }, { status: 429 });

  const response = await fetch(new URL("/translate", serverEnv.TRANSLATE_API_URL), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ q: post.body, source: post.language, target, format: "text", api_key: serverEnv.TRANSLATE_API_KEY }),
    signal: AbortSignal.timeout(10_000),
  }).catch(() => null);
  const translated = providerResponse.safeParse(await response?.json().catch(() => null));
  if (!response?.ok || !translated.success) return NextResponse.json({ error: "Translation failed" }, { status: 502 });

  await createServiceClient()
    ?.from("post_translations")
    .upsert({ post_id: post.id, target_language: target, body: translated.data.translatedText, created_at: new Date().toISOString() });

  return NextResponse.json({ text: translated.data.translatedText });
}
