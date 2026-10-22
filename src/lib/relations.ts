import { z } from "zod";
import { isReportReason, LIMITS, type ReportReason } from "@/lib/catalogue";

// Follows, mutes and blocks are plain rows the viewer owns; the website's
// action and the app write them the same way.
export const RELATIONS = {
  follow: { table: "follows", self: "follower_id", other: "followee_id" },
  mute: { table: "mutes", self: "muter_id", other: "muted_id" },
  block: { table: "blocks", self: "blocker_id", other: "blocked_id" },
} as const;

export type Relation = keyof typeof RELATIONS;

export const relationSchema = z.enum(["follow", "mute", "block"]);

// A legal complaint (terms, section 7) needs the problem explained and a way
// to reach the person making it.
export const reportSchema = z
  .object({
    targetType: z.enum(["post", "profile", "message", "event", "opportunity", "space"]),
    targetId: z.uuid(),
    reason: z.custom<ReportReason>(isReportReason, "Choose a reason."),
    details: z.string().trim().max(LIMITS.reportDetails, `Keep it to ${LIMITS.reportDetails} characters. Email us if you need more.`),
    contact: z.string().trim().max(200, "Contact details can be up to 200 characters.").optional(),
  })
  .refine((report) => report.reason !== "legal" || (report.details !== "" && Boolean(report.contact)), "Explain the problem and add how we can contact you.");

export type Report = z.input<typeof reportSchema>;

// The database function's arguments for a parsed report.
export const reportArguments = (report: z.output<typeof reportSchema>) => ({
  p_target_type: report.targetType,
  p_target_id: report.targetId,
  p_reason: report.reason,
  p_details: report.details || null,
  p_contact: report.reason === "legal" ? report.contact : null,
});
