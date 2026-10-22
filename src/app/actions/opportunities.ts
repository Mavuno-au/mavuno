"use server";

import { after } from "next/server";
import { z } from "zod";
import { runTasksFor } from "@/lib/background-tasks";
import { opportunityFormSchema as opportunitySchema, savedListingRow, type SavedListing } from "@/lib/community";
import { done, fail, failFrom, ok, type Result } from "@/lib/result";
import { firstIssue } from "@/lib/schemas";
import { createClient } from "@/lib/supabase/server";
import { getViewer } from "@/lib/viewer";

const id = z.uuid();

export async function createOpportunity(form: FormData): Promise<Result<SavedListing>> {
  const viewer = await getViewer();
  if (!viewer) return fail("Sign in first.");
  const posterId = id.safeParse(form.get("posterId"));
  const parsed = opportunitySchema.safeParse(Object.fromEntries(form));
  if (!posterId.success) return fail("Choose who is posting this.");
  if (!parsed.success) return fail(firstIssue(parsed.error));
  if (parsed.data.deadline_at && Date.parse(parsed.data.deadline_at) < Date.now()) return fail("Choose a deadline that hasn't passed.");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("opportunities")
    .insert({ ...parsed.data, poster_id: posterId.data, created_by: viewer.id })
    .select("id, status")
    .single();
  if (error) return failFrom(error);
  const saved = savedListingRow.parse(data);
  // The database queued the automatic check for new members' listings.
  after(() => runTasksFor(saved.id));
  return ok(saved);
}

export async function updateOpportunity(opportunityId: string, form: FormData): Promise<Result<SavedListing>> {
  const parsed = opportunitySchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const supabase = await createClient();
  const { data, error } = await supabase.from("opportunities").update(parsed.data).eq("id", id.parse(opportunityId)).select("id, status").single();
  if (error) return failFrom(error);
  const saved = savedListingRow.parse(data);
  // The database queues a fresh automatic check for the edited text.
  after(() => runTasksFor(saved.id));
  return ok(saved);
}

export async function setOpportunitySaved(opportunityId: string, saved: boolean): Promise<Result> {
  const viewer = await getViewer();
  if (!viewer) return fail("Sign in first.");
  const row = { user_id: viewer.id, opportunity_id: id.parse(opportunityId) };
  const supabase = await createClient();
  const { error } = saved
    ? await supabase.from("saved_opportunities").upsert(row, { onConflict: "user_id,opportunity_id", ignoreDuplicates: true })
    : await supabase.from("saved_opportunities").delete().match(row);
  return error ? failFrom(error) : done;
}

export async function closeOpportunity(opportunityId: string): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("opportunities")
    .update({ closed_at: new Date().toISOString() })
    .eq("id", id.parse(opportunityId))
    .select("id")
    .single();
  return error ? failFrom(error) : done;
}
