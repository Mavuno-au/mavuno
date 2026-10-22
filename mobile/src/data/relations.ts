import { z } from "zod";
import { RELATIONS, reportArguments, reportSchema, type Relation, type Report } from "@/lib/relations";
import { done, fail, failFrom, type Result } from "@/lib/result";
import { firstIssue } from "@/lib/schemas";
import { supabase } from "@/data/supabase";
import { emitRelationChanged } from "@/util/events";

export type { Relation, Report } from "@/lib/relations";

// The website's setRelation (src/app/actions/social.ts) against the same
// rows, which row level security lets only the viewer write.
export async function setRelation(relation: Relation, viewerId: string, profileId: string, on: boolean): Promise<Result> {
  const { table, self, other } = RELATIONS[relation];
  const row = { [self]: viewerId, [other]: z.uuid().parse(profileId) };
  const { error } = on
    ? await supabase.from(table).upsert(row, { onConflict: `${self},${other}`, ignoreDuplicates: true })
    : await supabase.from(table).delete().match(row);
  if (error) return failFrom(error);
  if (relation !== "follow") emitRelationChanged();
  return done;
}

export async function reportContent(input: Report): Promise<Result> {
  const parsed = reportSchema.safeParse(input);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const { error } = await supabase.rpc("report_content", reportArguments(parsed.data));
  return error ? failFrom(error) : done;
}
