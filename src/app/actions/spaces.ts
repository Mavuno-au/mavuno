"use server";

import { z } from "zod";
import { newSpaceSchema } from "@/lib/community";
import { done, fail, failFrom, ok, type Result } from "@/lib/result";
import { firstIssue } from "@/lib/schemas";
import { createClient } from "@/lib/supabase/server";
import { getViewer } from "@/lib/viewer";

export async function createSpace(form: FormData): Promise<Result<string>> {
  const parsed = newSpaceSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const space = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.rpc("create_space", {
    p_slug: space.slug,
    p_name: space.name,
    p_description: space.description,
    p_kind: space.kind,
    p_city_id: space.kind === "city" ? space.cityId : null,
    p_emoji: space.emoji || null,
  });
  if (error?.code === "23505") return fail("A space already uses that address. Try another.");
  if (error?.code === "23514") return fail("That address is taken.");
  if (error) return failFrom(error);
  return ok(space.slug);
}

export async function setMembership(spaceId: string, join: boolean): Promise<Result> {
  const viewer = await getViewer();
  if (!viewer) return fail("Sign in first.");
  const row = { space_id: z.uuid().parse(spaceId), user_id: viewer.id };
  const supabase = await createClient();
  const { error } = join
    ? await supabase.from("space_members").upsert(row, { onConflict: "space_id,user_id", ignoreDuplicates: true })
    : await supabase.from("space_members").delete().match(row);
  return error ? failFrom(error) : done;
}
