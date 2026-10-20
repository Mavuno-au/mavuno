"use server";

import { z } from "zod";
import { formField, RESERVED_SPACE_SLUGS, spaceKindSchema } from "@/lib/data/community";
import { done, fail, failFrom, ok, type Result } from "@/lib/result";
import { firstIssue } from "@/lib/schemas";
import { createClient } from "@/lib/supabase/server";
import { getViewer } from "@/lib/viewer";

const newSpaceSchema = z
  .object({
    name: z.string().trim().min(2, "Give the space a name of at least 2 characters.").max(60, "Keep the name to 60 characters."),
    slug: z
      .string()
      .trim()
      .toLowerCase()
      .regex(/^[a-z0-9-]{2,40}$/, "Use 2 to 40 lowercase letters, numbers or dashes for the address.")
      .refine((slug) => !RESERVED_SPACE_SLUGS.some((reserved) => reserved === slug), "That address is taken."),
    description: z.string().trim().max(500, "Keep the description to 500 characters."),
    kind: spaceKindSchema,
    cityId: formField.number(1, 32767, "Choose a city from the list."),
    emoji: z.string().trim().max(16, "Use one emoji."),
  })
  .refine((space) => space.kind !== "city" || space.cityId !== null, { message: "Choose the city this space is for.", path: ["cityId"] });

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
