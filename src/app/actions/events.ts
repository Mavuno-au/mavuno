"use server";

import { z } from "zod";
import { eventCategorySchema, eventFormatSchema, formField, fromZonedInput, rsvpSchema, timezoneSchema, type RsvpStatus, type SavedListing } from "@/lib/data/community";
import { contentStatusSchema } from "@/lib/domain";
import { publicEnv } from "@/lib/env";
import { done, fail, failFrom, ok, type Result } from "@/lib/result";
import { firstIssue, httpsUrl } from "@/lib/schemas";
import { createClient } from "@/lib/supabase/server";
import { getViewer } from "@/lib/viewer";

const id = z.uuid();
const localTime = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "Choose a date and time.");
const MEDIA = `${publicEnv.supabaseUrl}/storage/v1/object/public/media/`;

const eventSchema = z
  .object({
    title: z.string().trim().min(3, "Give your event a title of at least 3 characters.").max(120, "Keep the title to 120 characters."),
    description: z.string().trim().max(4000, "Keep the description to 4,000 characters."),
    category: eventCategorySchema,
    format: eventFormatSchema,
    timezone: timezoneSchema,
    startsAt: localTime,
    endsAt: z.union([z.literal(""), localTime]).optional(),
    cityId: formField.number(1, 32767, "Choose a city from the list."),
    venue: formField.text(120, "Keep the venue name to 120 characters."),
    address: formField.text(200, "Keep the address to 200 characters."),
    onlineUrl: httpsUrl.optional(),
    ticketUrl: httpsUrl,
    coverUrl: formField.text(500, "Upload the cover image again.").refine((url) => url === null || url.startsWith(MEDIA), "Upload the cover image again."),
    free: formField.checkbox,
    capacity: formField.number(1, 100000, "Capacity is a number from 1 to 100,000."),
    spaceId: formField.text(36, "Choose a space from the list.").pipe(id.nullable()),
  })
  .refine((event) => event.format === "online" || event.cityId !== null, { message: "Choose the city it's in.", path: ["cityId"] })
  .refine((event) => event.format === "in_person" || Boolean(event.onlineUrl), { message: "Add the link people use to join online.", path: ["onlineUrl"] })
  .refine((event) => !event.endsAt || event.endsAt > event.startsAt, { message: "The end has to be after the start.", path: ["endsAt"] })
  .transform((event) => ({
    title: event.title,
    description: event.description,
    category: event.category,
    format: event.format,
    timezone: event.timezone,
    starts_at: fromZonedInput(event.startsAt, event.timezone),
    ends_at: event.endsAt ? fromZonedInput(event.endsAt, event.timezone) : null,
    city_id: event.cityId,
    venue_name: event.format === "online" ? null : event.venue,
    address: event.format === "online" ? null : event.address,
    online_url: event.format === "in_person" ? null : (event.onlineUrl ?? null),
    ticket_url: event.ticketUrl,
    cover_url: event.coverUrl,
    is_free: event.free,
    capacity: event.capacity,
    space_id: event.spaceId,
  }));

const savedRow = z.object({ id, status: contentStatusSchema });

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
  return error ? failFrom(error) : ok(savedRow.parse(data));
}

export async function updateEvent(eventId: string, form: FormData): Promise<Result<SavedListing>> {
  const parsed = eventSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const supabase = await createClient();
  const { data, error } = await supabase.from("events").update(parsed.data).eq("id", id.parse(eventId)).select("id, status").single();
  return error ? failFrom(error) : ok(savedRow.parse(data));
}

export async function setRsvp(eventId: string, status: RsvpStatus | null): Promise<Result> {
  const viewer = await getViewer();
  if (!viewer) return fail("Sign in first.");
  const supabase = await createClient();
  const key = { event_id: id.parse(eventId), user_id: viewer.id };
  const { error } = status
    ? await supabase.from("event_rsvps").upsert({ ...key, status: rsvpSchema.parse(status) }, { onConflict: "event_id,user_id" })
    : await supabase.from("event_rsvps").delete().match(key);
  return error ? failFrom(error) : done;
}

export async function cancelEvent(eventId: string): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase.from("events").update({ cancelled_at: new Date().toISOString() }).eq("id", id.parse(eventId)).select("id").single();
  return error ? failFrom(error) : done;
}
