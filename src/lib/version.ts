import { unstable_rethrow } from "next/navigation";
import { toast } from "sonner";
import { z } from "zod";
import { fail, type Result } from "@/lib/result";

// After a deploy, a page that is still open calls server actions the new
// server no longer has. Rather than failing quietly until someone reloads,
// the page compares its own build with the live one when a poll fails or the
// tab comes back after a while, and offers a reload once.

const versionSchema = z.object({ build: z.string().nullable() });
const CHECK_EVERY = 60_000;

let current: string | null = null;
let noticed = false;
let lastCheck = 0;

export function setCurrentBuild(build: string | null) {
  current = build;
}

export async function checkForUpdate() {
  if (!current || noticed || Date.now() - lastCheck < CHECK_EVERY) return;
  lastCheck = Date.now();
  const response = await fetch("/api/version", { cache: "no-store" }).catch(() => null);
  if (!response?.ok) return;
  const live = versionSchema.safeParse(await response.json().catch(() => null));
  if (!live.success || live.data.build === null || live.data.build === current) return;
  noticed = true;
  toast("Mavuno was updated", {
    id: "mavuno-updated",
    description: "Reload to get the latest version.",
    duration: Infinity,
    action: { label: "Reload", onClick: () => window.location.reload() },
  });
}

// A server action that can't be reached (offline, or gone after a deploy)
// rejects, and inside a transition a rejection replaces the page with the
// error screen. This answers a Result instead, so the caller's own failure
// path rolls back and says so. Redirects and the like still go to Next.
export async function reach<T>(call: Promise<Result<T>>): Promise<Result<T>> {
  try {
    return await call;
  } catch (error) {
    unstable_rethrow(error);
    void checkForUpdate();
    return fail("Couldn't reach Mavuno. Check your connection and try again.");
  }
}
