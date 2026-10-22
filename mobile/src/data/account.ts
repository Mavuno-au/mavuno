import { z } from "zod";
import { done, failFrom, type Result } from "@/lib/result";
import { signOut } from "@/data/session";
import { supabase } from "@/data/supabase";

// The website's deleteAccount (src/app/actions/settings.ts): the member's
// files go first, because storage lets people delete only under the profiles
// they act as, and the account's row is gone once the database function runs.

const MEDIA_KINDS = ["posts", "avatars", "banners", "events"] as const;
const PAGE = 1000;

async function listFolder(folder: string, offset = 0): Promise<string[]> {
  const { data } = await supabase.storage.from("media").list(folder, { limit: PAGE, offset });
  const paths = (data ?? []).map((file) => `${folder}/${file.name}`);
  return paths.length === PAGE ? [...paths, ...(await listFolder(folder, offset + PAGE))] : paths;
}

async function removeProfileMedia(profileIds: string[]) {
  const folders = profileIds.flatMap((profileId) => MEDIA_KINDS.map((kind) => `${profileId}/${kind}`));
  const paths = (await Promise.all(folders.map((folder) => listFolder(folder)))).flat();
  for (let start = 0; start < paths.length; start += PAGE) {
    await supabase.storage.from("media").remove(paths.slice(start, start + PAGE));
  }
}

const memberRows = z.array(z.object({ org_id: z.uuid(), user_id: z.uuid() }));

// Organisations the person owns alone are deleted with their account.
async function soleOwnedOrganisations(viewerId: string) {
  const { data: mine } = await supabase.from("organisation_members").select("org_id, user_id").eq("user_id", viewerId).eq("role", "owner");
  const owned = memberRows.catch([]).parse(mine ?? []).map((row) => row.org_id);
  if (owned.length === 0) return [];
  const { data } = await supabase.from("organisation_members").select("org_id, user_id").in("org_id", owned).eq("role", "owner");
  const owners = memberRows.catch([]).parse(data ?? []);
  return owned.filter((orgId) => owners.every((row) => row.org_id !== orgId || row.user_id === viewerId));
}

export async function deleteAccount(viewerId: string): Promise<Result> {
  await removeProfileMedia([viewerId, ...(await soleOwnedOrganisations(viewerId))]);
  const { error } = await supabase.rpc("delete_my_account");
  if (error) return failFrom(error);
  await signOut("deleted");
  return done;
}
