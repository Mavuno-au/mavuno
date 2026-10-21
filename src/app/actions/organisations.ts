"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { removeProfileMedia } from "@/lib/data/settings";
import { done, fail, failFrom, type Result } from "@/lib/result";
import { firstIssue, httpsUrl, usernameSchema } from "@/lib/schemas";
import { createClient } from "@/lib/supabase/server";
import { getViewer } from "@/lib/viewer";

const id = z.uuid();
const teamRole = z.enum(["admin", "editor"]);
export type TeamRole = z.infer<typeof teamRole>;

const newOrganisationSchema = z.object({
  username: usernameSchema,
  name: z.string().trim().min(2, "Add the organisation's name.").max(60, "Names can be up to 60 characters."),
  bio: z.string().trim().max(300, "The bio can be up to 300 characters."),
  category: z.string().trim().max(60, "The category can be up to 60 characters."),
  cityId: z.union([z.literal(""), z.coerce.number().int().positive()]).transform((value) => (value === "" ? null : value)),
  website: httpsUrl,
});

export async function createOrganisation(_: Result | null, form: FormData): Promise<Result> {
  const parsed = newOrganisationSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const input = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.rpc("create_organisation", {
    p_username: input.username,
    p_display_name: input.name,
    p_bio: input.bio,
    p_category: input.category || null,
    p_city_id: input.cityId,
    p_website: input.website,
  });
  if (error) return failFrom(error);
  redirect(`/settings/organisations/${input.username}`);
}

const addMemberSchema = z.object({ orgId: id, username: usernameSchema, role: teamRole });

export async function addTeamMember(input: z.input<typeof addMemberSchema>): Promise<Result> {
  const parsed = addMemberSchema.safeParse(input);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const { orgId, username, role } = parsed.data;
  const supabase = await createClient();
  const { data: person } = await supabase.from("profiles").select("id, account_type").eq("username", username).maybeSingle();
  const found = z.object({ id, account_type: z.literal("person") }).safeParse(person);
  if (!found.success) return fail(`There's no person called @${username}.`);
  const { error } = await supabase.from("organisation_members").insert({ org_id: orgId, user_id: found.data.id, role });
  if (error) return error.code === "23505" ? fail(`@${username} is already on the team.`) : failFrom(error);
  refresh();
  return done;
}

const memberSchema = z.object({ orgId: id, userId: id });

const roleChangeSchema = memberSchema.extend({ role: teamRole });

export async function setTeamRole(input: z.input<typeof roleChangeSchema>): Promise<Result> {
  const { orgId, userId, role } = roleChangeSchema.parse(input);
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_organisation_role", { p_org_id: orgId, p_user_id: userId, p_role: role });
  if (error) return failFrom(error);
  refresh();
  return done;
}

// The new owner is promoted before the current one steps down, so the
// organisation always has an owner.
export async function handOverOwnership(input: z.input<typeof memberSchema>): Promise<Result> {
  const viewer = await getViewer();
  if (!viewer) return fail("Sign in first.");
  const { orgId, userId } = memberSchema.parse(input);
  const supabase = await createClient();
  const promoted = await supabase.rpc("set_organisation_role", { p_org_id: orgId, p_user_id: userId, p_role: "owner" });
  if (promoted.error) return failFrom(promoted.error);
  const stepped = await supabase.rpc("set_organisation_role", { p_org_id: orgId, p_user_id: viewer.id, p_role: "admin" });
  if (stepped.error) return failFrom(stepped.error);
  refresh();
  return done;
}

export async function removeTeamMember(input: z.input<typeof memberSchema>): Promise<Result> {
  const viewer = await getViewer();
  if (!viewer) return fail("Sign in first.");
  const { orgId, userId } = memberSchema.parse(input);
  const supabase = await createClient();
  const { data, error } = await supabase.from("organisation_members").delete().match({ org_id: orgId, user_id: userId }).select("user_id");
  if (error) return failFrom(error);
  if (!data?.length) return fail("You can't remove this person.");
  if (userId === viewer.id) redirect("/settings/organisations");
  refresh();
  return done;
}

export async function deleteOrganisation(orgId: string): Promise<Result> {
  const viewer = await getViewer();
  const org = viewer?.organisations.find((candidate) => candidate.id === id.parse(orgId));
  if (org?.role !== "owner") return fail("Only owners can delete an organisation.");
  await removeProfileMedia([org.id]);
  const supabase = await createClient();
  const { error } = await supabase.rpc("delete_organisation", { p_org_id: org.id });
  if (error) return failFrom(error);
  redirect("/settings/organisations");
}

// Being added to a team is an invitation; the person says yes or no.
export async function acceptTeamInvitation(orgId: string): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("accept_team_invitation", { p_org_id: id.parse(orgId) });
  return error ? failFrom(error) : done;
}

export async function declineTeamInvitation(orgId: string): Promise<Result> {
  const viewer = await getViewer();
  if (!viewer) return fail("Sign in first.");
  const supabase = await createClient();
  const { error } = await supabase.from("organisation_members").delete().match({ org_id: id.parse(orgId), user_id: viewer.id });
  return error ? failFrom(error) : done;
}
