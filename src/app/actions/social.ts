"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { RELATIONS, relationSchema, reportArguments, reportSchema, type Relation, type Report } from "@/lib/relations";
import { done, fail, failFrom, type Result } from "@/lib/result";
import { firstIssue } from "@/lib/schemas";
import { createClient } from "@/lib/supabase/server";
import { getViewer } from "@/lib/viewer";

export type { Relation, Report } from "@/lib/relations";

const id = z.uuid();

export async function setRelation(relation: Relation, profileId: string, on: boolean): Promise<Result> {
  const viewer = await getViewer();
  if (!viewer) return fail("Sign in first.");
  const { table, self, other } = RELATIONS[relationSchema.parse(relation)];
  const row = { [self]: viewer.id, [other]: id.parse(profileId) };
  const supabase = await createClient();
  const { error } = on
    ? await supabase.from(table).upsert(row, { onConflict: `${self},${other}`, ignoreDuplicates: true })
    : await supabase.from(table).delete().match(row);
  if (error) return failFrom(error);
  if (relation !== "follow") revalidatePath("/", "layout");
  return done;
}

export async function reportContent(input: Report): Promise<Result> {
  const parsed = reportSchema.safeParse(input);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const supabase = await createClient();
  const { error } = await supabase.rpc("report_content", reportArguments(parsed.data));
  return error ? failFrom(error) : done;
}
