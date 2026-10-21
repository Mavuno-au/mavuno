"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { done, fail, failFrom, ok, type Result } from "@/lib/result";
import { breakableRuleSchema, suspensionLengthSchema } from "@/lib/rules";
import { firstIssue, usernameSchema } from "@/lib/schemas";
import { createClient } from "@/lib/supabase/server";

const id = z.uuid();
const reason = z.string().trim().max(280, "Reasons can be up to 280 characters.");
const target = z.object({ targetType: z.enum(["post", "message", "event", "opportunity", "space"]), targetId: id });
const reportTarget = z.object({ targetType: z.enum(["post", "profile", "message", "event", "opportunity", "space"]), targetId: id });

async function rpc(name: string, args: Record<string, unknown>): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase.rpc(name, args);
  if (error) return failFrom(error);
  refresh();
  return done;
}

const rule = breakableRuleSchema.nullable().refine((value) => value !== null, "Choose the rule it breaks.");

// Removing anything names the rule it broke, so the notice can say so.
const decisionSchema = z.discriminatedUnion("approve", [
  target.extend({ approve: z.literal(true) }),
  target.extend({ approve: z.literal(false), reason, rule }),
]);

export async function moderate(input: z.input<typeof decisionSchema>): Promise<Result> {
  const parsed = decisionSchema.safeParse(input);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const decision = parsed.data;
  return rpc("moderate_content", {
    p_target_type: decision.targetType,
    p_target_id: decision.targetId,
    p_approve: decision.approve,
    p_reason: decision.approve ? null : decision.reason || null,
    p_rule: decision.approve ? null : decision.rule,
  });
}

export async function approveAll(items: z.input<typeof target>[]): Promise<Result> {
  const parsed = z.array(target).max(100).parse(items);
  const posts = parsed.filter((item) => item.targetType === "post").map((item) => item.targetId);
  const supabase = await createClient();
  if (posts.length > 0) {
    const { error } = await supabase.rpc("moderate_approve_posts", { p_post_ids: posts });
    if (error) return failFrom(error);
  }
  for (const item of parsed.filter((candidate) => candidate.targetType !== "post")) {
    const { error } = await supabase.rpc("moderate_content", { p_target_type: item.targetType, p_target_id: item.targetId, p_approve: true });
    if (error) return failFrom(error);
  }
  refresh();
  return done;
}

export async function dismissReports(input: z.input<typeof reportTarget>): Promise<Result> {
  const { targetType, targetId } = reportTarget.parse(input);
  return rpc("moderate_dismiss_reports", { p_target_type: targetType, p_target_id: targetId });
}

const personByUsername = async (username: string): Promise<Result<string>> => {
  const supabase = await createClient();
  const { data } = await supabase.from("profiles").select("id, account_type").eq("username", username).maybeSingle();
  const person = z.object({ id, account_type: z.literal("person") }).safeParse(data);
  return person.success ? ok(person.data.id) : fail(`There's no person called @${username}.`);
};

// From a report, or from the People tab by username.
const who = z.union([z.object({ profileId: id }), z.object({ username: usernameSchema })]);
const resolve = (target: z.infer<typeof who>) => ("profileId" in target ? Promise.resolve(ok(target.profileId)) : personByUsername(target.username));

const suspendSchema = z.intersection(who, z.object({ length: suspensionLengthSchema, reason, rule }));

// A second suspension extends the first; the database says until when.
export async function suspend(input: z.input<typeof suspendSchema>): Promise<Result> {
  const parsed = suspendSchema.safeParse(input);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const person = await resolve(parsed.data);
  if (!person.ok) return person;
  return rpc("moderate_suspend", { p_profile_id: person.data, p_duration: parsed.data.length, p_reason: parsed.data.reason || null, p_rule: parsed.data.rule });
}

const banSchema = z.intersection(who, z.object({ reason, rule }));

export async function ban(input: z.input<typeof banSchema>): Promise<Result> {
  const parsed = banSchema.safeParse(input);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const person = await resolve(parsed.data);
  if (!person.ok) return person;
  return rpc("moderate_ban", { p_profile_id: person.data, p_reason: parsed.data.reason || null, p_rule: parsed.data.rule });
}

const liftSchema = z.object({ profileId: id, reason: reason.optional() });

export async function liftSuspension(input: z.input<typeof liftSchema>): Promise<Result> {
  const parsed = liftSchema.safeParse(input);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  return rpc("moderate_lift_suspension", { p_profile_id: parsed.data.profileId, p_reason: parsed.data.reason || null });
}

const restoreSchema = z.object({ decision: z.number().int().positive(), reason: reason.optional() });

// After a successful appeal: brings back what the decision removed, or ends
// the suspension or ban it imposed.
export async function restoreDecision(input: z.input<typeof restoreSchema>): Promise<Result> {
  const parsed = restoreSchema.safeParse(input);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  return rpc("moderate_restore", { p_action_id: parsed.data.decision, p_reason: parsed.data.reason || null });
}

// Members accept the community rules once before their first post; the
// database refuses posts and listings until then.
export async function acceptRules(): Promise<Result> {
  return rpc("accept_rules", {});
}

// Why a moderator believes someone is under 16, and how a review found they
// are older (public.age_check_basis). Neither keeps any detail about them.
const suspicionSchema = z.enum(["report", "posts", "profile", "other"], "Choose why you believe they're under 16.");
const evidenceSchema = z.enum(["video_call", "document", "other"], "Choose how they showed their age.");

const deactivateSchema = z.union([z.object({ profileId: id, basis: suspicionSchema }), z.object({ username: usernameSchema, basis: suspicionSchema })]);

export async function deactivateUnder16(input: z.input<typeof deactivateSchema>): Promise<Result> {
  const parsed = deactivateSchema.safeParse(input);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const profile = "profileId" in parsed.data ? ok(parsed.data.profileId) : await personByUsername(parsed.data.username);
  if (!profile.ok) return profile;
  return rpc("moderate_deactivate_under_16", { p_profile_id: profile.data, p_basis: parsed.data.basis });
}

const reinstateSchema = z.object({ profileId: id, basis: evidenceSchema });

export async function reinstateAge(input: z.input<typeof reinstateSchema>): Promise<Result> {
  const parsed = reinstateSchema.safeParse(input);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  return rpc("moderate_reinstate_age", { p_profile_id: parsed.data.profileId, p_basis: parsed.data.basis });
}

export async function verifyOrganisation(orgId: string, verified: boolean): Promise<Result> {
  return rpc("moderate_verify_organisation", { p_org_id: id.parse(orgId), p_verified: z.boolean().parse(verified) });
}

const siteRoleSchema = z.object({ username: usernameSchema, role: z.enum(["member", "moderator", "admin"]) });

export async function setSiteRole(input: z.input<typeof siteRoleSchema>): Promise<Result> {
  const parsed = siteRoleSchema.safeParse(input);
  if (!parsed.success) return fail("Enter a username.");
  const person = await personByUsername(parsed.data.username);
  if (!person.ok) return person;
  return rpc("admin_set_site_role", { p_profile_id: person.data, p_role: parsed.data.role });
}

const siteSettingsSchema = z.object({ premoderation: z.boolean(), translations: z.boolean() });

export async function updateSiteSettings(input: z.input<typeof siteSettingsSchema>): Promise<Result> {
  const { premoderation, translations } = siteSettingsSchema.parse(input);
  return rpc("admin_update_site_settings", { p_premoderation: premoderation, p_translations: translations });
}
