import { ageCheckPath, onboardingPath } from "@/lib/safe-redirect";
import type { Viewer } from "@/lib/viewer-row";

// Settings (to download or delete an account) and the legal pages stay
// reachable from every step.
const OPEN_PATHS = ["/settings", "/privacy", "/terms", "/rules"];

// Members confirm their age, then finish setting up, before using the app,
// and come back to `path` after. Banned and deactivated members only reach
// the pages that let them read the decision, export and delete. Null when
// nothing stands in the way.
export function setupPath(viewer: Pick<Viewer, "banned" | "age" | "onboarded">, path: string): string | null {
  if (OPEN_PATHS.some((open) => path.startsWith(open))) return null;
  if (viewer.banned) return "/banned";
  // The setup pages send people on from the server themselves, such as the
  // confirmation email's link to /onboarding.
  if (path.startsWith("/onboarding")) return null;
  switch (viewer.age.kind) {
    case "deactivated":
      return "/deactivated";
    case "unconfirmed":
      // Setup comes straight after the age check, not after a stop at `path`.
      return ageCheckPath(viewer.onboarded ? path : onboardingPath(path));
    case "confirmed":
      return viewer.onboarded ? null : onboardingPath(path);
    default: {
      const exhaustive: never = viewer.age;
      return exhaustive;
    }
  }
}
