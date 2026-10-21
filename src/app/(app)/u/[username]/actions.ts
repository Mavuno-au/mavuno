"use server";

import { z } from "zod";
import { connectionCursor, loadConnections, type ConnectionsPage } from "@/lib/data/profiles";
import { fail, ok, type Result } from "@/lib/result";

const requestSchema = z.object({
  profileId: z.uuid(),
  direction: z.enum(["followers", "following"]),
  cursor: z.string().max(100).refine((cursor) => connectionCursor.safeParse(cursor).success),
});

export async function moreConnections(input: z.input<typeof requestSchema>): Promise<Result<ConnectionsPage>> {
  const parsed = requestSchema.safeParse(input);
  if (!parsed.success) return fail("Something went wrong. Try again.");
  const { profileId, direction, cursor } = parsed.data;
  return ok(await loadConnections(profileId, direction, cursor));
}
