import { done, failFrom, type Result } from "@/lib/result";
import { signOut } from "@/data/session";
import { supabase } from "@/data/supabase";

// The website's deleteAccount (src/app/actions/settings.ts). The database
// queues the account's files, and those of organisations it owned alone, for
// erasure as the rows go.
export async function deleteAccount(): Promise<Result> {
  const { error } = await supabase.rpc("delete_my_account");
  if (error) return failFrom(error);
  await signOut("deleted");
  return done;
}

// Owners only, as on the website.
export async function deleteOrganisation(orgId: string): Promise<Result> {
  const { error } = await supabase.rpc("delete_organisation", { p_org_id: orgId });
  return error ? failFrom(error) : done;
}
