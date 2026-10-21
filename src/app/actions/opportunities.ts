"use server";

import { after } from "next/server";
import { z } from "zod";
import { runTasksFor } from "@/lib/background-tasks";
import { DEADLINE_ZONE, formField, fromZonedInput, type SavedListing } from "@/lib/data/community";
import { contentStatusSchema, opportunityTypeSchema } from "@/lib/domain";
import { done, fail, failFrom, ok, type Result } from "@/lib/result";
import { firstIssue, httpsUrl } from "@/lib/schemas";
import { createClient } from "@/lib/supabase/server";
import { getViewer } from "@/lib/viewer";

const id = z.uuid();

const opportunitySchema = z
  .object({
    type: opportunityTypeSchema,
    title: z.string().trim().min(3, "Give it a title of at least 3 characters.").max(120, "Keep the title to 120 characters."),
    organisation: formField.text(120, "Keep the organisation name to 120 characters."),
    description: z.string().trim().min(10, "Describe the opportunity in at least 10 characters.").max(6000, "Keep the description to 6,000 characters."),
    cityId: formField.number(1, 32767, "Choose a city from the list."),
    remote: formField.checkbox,
    location: formField.text(120, "Keep the location to 120 characters."),
    applyUrl: httpsUrl,
    applyEmail: z.union([z.literal(""), z.email("Enter a valid email address.").max(200)]).transform((email) => email || null),
    deadline: z.union([z.literal(""), z.iso.date("Choose a valid deadline.")]),
    compensation: formField.text(120, "Keep the pay or value to 120 characters."),
  })
  .refine((o) => o.applyUrl !== null || o.applyEmail !== null, { message: "Add a link or an email address for applications.", path: ["applyUrl"] })
  .transform((o) => ({
    type: o.type,
    title: o.title,
    organisation_name: o.organisation,
    description: o.description,
    city_id: o.cityId,
    is_remote: o.remote,
    location_text: o.location,
    apply_url: o.applyUrl,
    apply_email: o.applyEmail,
    deadline_at: o.deadline ? fromZonedInput(`${o.deadline}T23:59`, DEADLINE_ZONE) : null,
    compensation: o.compensation,
  }));

const savedRow = z.object({ id, status: contentStatusSchema });

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
  const saved = savedRow.parse(data);
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
  const saved = savedRow.parse(data);
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
