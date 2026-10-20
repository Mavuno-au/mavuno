"use server";

import { z } from "zod";
import { loadCounts, loadWhoToFollow } from "@/lib/data/shell";
import type { PersonSummary } from "@/lib/domain";
import { fail, ok, type Result } from "@/lib/result";
import { getViewer } from "@/lib/viewer";

export async function refreshCounts() {
  if (!(await getViewer())) return { notifications: 0, messages: 0 };
  return loadCounts();
}

// The refresh button in Who to follow. The browser keeps the round in a cookie
// so the next page load shows the same page.
export async function loadSuggestionPage(round: number): Promise<Result<PersonSummary[]>> {
  const viewer = await getViewer();
  if (!viewer) return fail("Sign in first.");
  const parsed = z.number().int().min(0).max(9999).safeParse(round);
  if (!parsed.success) return fail("Something went wrong. Try again.");
  return ok((await loadWhoToFollow(viewer, parsed.data)).people);
}
