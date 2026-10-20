import "server-only";
import { z } from "zod";
import { deletionDate } from "@/lib/age";
import { profileCardSchema, type ProfileCard } from "@/lib/domain";
import { createClient } from "@/lib/supabase/server";

// The notice written when the account was deactivated, which says whether the
// person told us or a moderator decided.
export async function loadAgeNotice(viewerId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("notifications")
    .select("message")
    .eq("recipient_id", viewerId)
    .eq("type", "moderation")
    .eq("rule", "age")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return z.object({ message: z.string() }).nullable().parse(data)?.message ?? null;
}

export const ageStepSchema = z.enum(["declared_under_16", "flagged", "reinstated", "deleted"]);
export type AgeStep = z.infer<typeof ageStepSchema>;
export const ageBasisSchema = z.enum(["self_declared", "report", "posts", "profile", "document", "video_call", "other"]);
export type AgeBasis = z.infer<typeof ageBasisSchema>;

export type DeactivatedAccount = { profile: ProfileCard; deactivatedAt: string; deletesAt: string };
export type AgeCheck = { id: number; step: AgeStep; basis: AgeBasis | null; profile: ProfileCard | null; createdAt: string };

const CARD = "id, username, display_name, avatar_url, colour:effective_colour, account_type, org_verified, headline";

// Moderators read profile settings and the record of age checks; members can't.
export async function loadAgeReview(): Promise<{ deactivated: DeactivatedAccount[]; record: AgeCheck[] }> {
  const supabase = await createClient();
  const [settings, checks] = await Promise.all([
    supabase.from("profile_settings").select(`age_deactivated_at, profile:profiles(${CARD})`).not("age_deactivated_at", "is", null).order("age_deactivated_at").limit(100),
    supabase.from("age_checks").select(`id, step, basis, created_at, profile:profiles!age_checks_profile_id_fkey(${CARD})`).order("created_at", { ascending: false }).limit(50),
  ]);
  if (settings.error) throw new Error(`Deactivated accounts failed: ${settings.error.message}`);
  if (checks.error) throw new Error(`Age checks failed: ${checks.error.message}`);

  const deactivated = z
    .array(z.object({ age_deactivated_at: z.string(), profile: profileCardSchema }))
    .parse(settings.data ?? [])
    .map((row) => ({ profile: row.profile, deactivatedAt: row.age_deactivated_at, deletesAt: deletionDate(row.age_deactivated_at) }));
  const record = z
    .array(z.object({ id: z.number(), step: ageStepSchema, basis: ageBasisSchema.nullable(), created_at: z.string(), profile: profileCardSchema.nullable() }))
    .parse(checks.data ?? [])
    .map((row) => ({ id: row.id, step: row.step, basis: row.basis, profile: row.profile, createdAt: row.created_at }));
  return { deactivated, record };
}
