"use server";

import { z } from "zod";
import { loadCounts, loadWhoToFollow } from "@/lib/data/shell";
import type { PersonSummary } from "@/lib/domain";
import { done, fail, failFrom, ok, type Result } from "@/lib/result";
import { createClient } from "@/lib/supabase/server";
import { getViewer } from "@/lib/viewer";

export async function refreshCounts() {
  if (!(await getViewer())) return { notifications: 0, messages: 0 };
  return loadCounts();
}

export type SuggestionPage = { people: PersonSummary[]; spares: PersonSummary[] };

// The refresh button in Who to follow. The browser keeps the round in a cookie
// so the next page load shows the same page.
export async function loadSuggestionPage(round: number): Promise<Result<SuggestionPage>> {
  const viewer = await getViewer();
  if (!viewer) return fail("Sign in first.");
  const parsed = z.number().int().min(0).max(9999).safeParse(round);
  if (!parsed.success) return fail("Something went wrong. Try again.");
  const page = await loadWhoToFollow(viewer, parsed.data);
  return ok({ people: page.people, spares: page.spares });
}

// "Not for me": the person leaves every suggestion for good, unless undone.
export async function dismissSuggestion(profileId: string, dismissed: boolean): Promise<Result> {
  const viewer = await getViewer();
  if (!viewer) return fail("Sign in first.");
  const parsed = z.uuid().safeParse(profileId);
  if (!parsed.success) return fail("Something went wrong. Try again.");
  const row = { user_id: viewer.id, dismissed_id: parsed.data };
  const supabase = await createClient();
  const { error } = dismissed
    ? await supabase.from("suggestion_dismissals").upsert(row, { onConflict: "user_id,dismissed_id", ignoreDuplicates: true })
    : await supabase.from("suggestion_dismissals").delete().match(row);
  return error ? failFrom(error) : done;
}
