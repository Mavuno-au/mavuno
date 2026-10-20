"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { isReportReason, type ReportReason } from "@/lib/catalogue";
import { done, fail, failFrom, type Result } from "@/lib/result";
import { firstIssue } from "@/lib/schemas";
import { createClient } from "@/lib/supabase/server";
import { getViewer } from "@/lib/viewer";

const id = z.uuid();

const RELATIONS = {
  follow: { table: "follows", self: "follower_id", other: "followee_id" },
  mute: { table: "mutes", self: "muter_id", other: "muted_id" },
  block: { table: "blocks", self: "blocker_id", other: "blocked_id" },
} as const;

export type Relation = keyof typeof RELATIONS;

export async function setRelation(relation: Relation, profileId: string, on: boolean): Promise<Result> {
  const viewer = await getViewer();
  if (!viewer) return fail("Sign in first.");
  const { table, self, other } = RELATIONS[z.enum(["follow", "mute", "block"]).parse(relation)];
  const row = { [self]: viewer.id, [other]: id.parse(profileId) };
  const supabase = await createClient();
  const { error } = on
    ? await supabase.from(table).upsert(row, { onConflict: `${self},${other}`, ignoreDuplicates: true })
    : await supabase.from(table).delete().match(row);
  if (error) return failFrom(error);
  if (relation !== "follow") revalidatePath("/", "layout");
  return done;
}

// A legal complaint (terms, section 7) needs the problem explained and a way
// to reach the person making it.
const reportSchema = z
  .object({
    targetType: z.enum(["post", "profile", "message", "event", "opportunity", "space"]),
    targetId: id,
    reason: z.custom<ReportReason>(isReportReason, "Choose a reason."),
    details: z.string().trim().max(500, "Keep it to 500 characters. Email us if you need more."),
    contact: z.string().trim().max(200, "Contact details can be up to 200 characters.").optional(),
  })
  .refine((report) => report.reason !== "legal" || (report.details !== "" && Boolean(report.contact)), "Explain the problem and add how we can contact you.");

export type Report = z.input<typeof reportSchema>;

export async function reportContent(input: Report): Promise<Result> {
  const parsed = reportSchema.safeParse(input);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const supabase = await createClient();
  const { error } = await supabase.rpc("report_content", {
    p_target_type: parsed.data.targetType,
    p_target_id: parsed.data.targetId,
    p_reason: parsed.data.reason,
    p_details: parsed.data.details || null,
    p_contact: parsed.data.reason === "legal" ? parsed.data.contact : null,
  });
  return error ? failFrom(error) : done;
}
