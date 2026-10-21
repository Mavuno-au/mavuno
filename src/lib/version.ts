import { toast } from "sonner";
import { z } from "zod";

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
