"use server";

import { after } from "next/server";
import { z } from "zod";
import { runTasksFor } from "@/lib/background-tasks";
import { eventFormSchema, rsvpSchema, savedListingRow, type RsvpStatus, type SavedListing } from "@/lib/community";
import { publicEnv } from "@/lib/env";
import { done, fail, failFrom, ok, type Result } from "@/lib/result";
import { firstIssue } from "@/lib/schemas";
import { createClient } from "@/lib/supabase/server";
import { getViewer } from "@/lib/viewer";

const id = z.uuid();
const eventSchema = eventFormSchema(`${publicEnv.supabaseUrl}/storage/v1/object/public/media/`);
export async function createEvent(form: FormData): Promise<Result<SavedListing>> {
  const viewer = await getViewer();
  if (!viewer) return fail("Sign in first.");
  const hostId = id.safeParse(form.get("hostId"));
  const parsed = eventSchema.safeParse(Object.fromEntries(form));
  if (!hostId.success) return fail("Choose who is hosting.");
  if (!parsed.success) return fail(firstIssue(parsed.error));
  if (Date.parse(parsed.data.starts_at) < Date.now()) return fail("Choose a start time in the future.");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("events")
    .insert({ ...parsed.data, host_id: hostId.data, created_by: viewer.id })
    .select("id, status")
    .single();
  if (error) return failFrom(error);
  const saved = savedListingRow.parse(data);
  // The database queued the automatic check for new members' listings.
  after(() => runTasksFor(saved.id));
  return ok(saved);
}

export async function updateEvent(eventId: string, form: FormData): Promise<Result<SavedListing>> {
  const parsed = eventSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const supabase = await createClient();
  const { data, error } = await supabase.from("events").update(parsed.data).eq("id", id.parse(eventId)).select("id, status").single();
  if (error) return failFrom(error);
  const saved = savedListingRow.parse(data);
  // The database queues a fresh automatic check for the edited text.
  after(() => runTasksFor(saved.id));
  return ok(saved);
}

export async function setRsvp(eventId: string, status: RsvpStatus | null): Promise<Result> {
  const viewer = await getViewer();
  if (!viewer) return fail("Sign in first.");
  const supabase = await createClient();
  const key = { event_id: id.parse(eventId), user_id: viewer.id };
  if (!status) {
    const { error } = await supabase.from("event_rsvps").delete().match(key);
    return error ? failFrom(error) : done;
  }
  // Members may update only an RSVP's status, and an upsert would rewrite the
  // key columns too, which Postgres refuses even when nothing conflicts.
  const parsed = rsvpSchema.parse(status);
  const { data, error } = await supabase.from("event_rsvps").update({ status: parsed }).match(key).select("event_id");
  if (error) return failFrom(error);
  if (data.length > 0) return done;
  const { error: inserted } = await supabase.from("event_rsvps").insert({ ...key, status: parsed });
  return inserted ? failFrom(inserted) : done;
}

export async function cancelEvent(eventId: string): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase.from("events").update({ cancelled_at: new Date().toISOString() }).eq("id", id.parse(eventId)).select("id").single();
  return error ? failFrom(error) : done;
}
