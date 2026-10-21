"use server";

import { z } from "zod";
import { postRowSchema } from "@/lib/domain";
import type { Presence } from "@/lib/post-presence";
import { failFrom, ok, type Result } from "@/lib/result";
import { createClient } from "@/lib/supabase/server";

// Reads the post the same way its page does, so the answer matches what a
// reload would show: no row means the reader can no longer see it.
export async function postPresence(postId: string): Promise<Result<Presence>> {
  const parsed = z.uuid().safeParse(postId);
  if (!parsed.success) return ok({ kind: "unavailable" });
  const supabase = await createClient();
  const { data, error } = await supabase.from("post_details").select("*").eq("id", parsed.data).maybeSingle();
  if (error) return failFrom(error);
  if (!data) return ok({ kind: "unavailable" });
  const row = postRowSchema.parse(data);
  return ok(row.kind === "tombstone" ? { kind: "deleted" } : { kind: "present" });
}
