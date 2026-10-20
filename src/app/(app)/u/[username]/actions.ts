"use server";

import { z } from "zod";
import { loadConnections, type ConnectionsPage } from "@/lib/data/profiles";
import { fail, ok, type Result } from "@/lib/result";
import { getViewer } from "@/lib/viewer";

const requestSchema = z.object({
  profileId: z.uuid(),
  direction: z.enum(["followers", "following"]),
  before: z.iso.datetime({ offset: true }),
});

export async function moreConnections(input: z.input<typeof requestSchema>): Promise<Result<ConnectionsPage>> {
  const parsed = requestSchema.safeParse(input);
  if (!parsed.success) return fail("Something went wrong. Try again.");
  const { profileId, direction, before } = parsed.data;
  return ok(await loadConnections(profileId, direction, await getViewer(), before));
}
