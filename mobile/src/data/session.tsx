import type { Session } from "@supabase/supabase-js";
import { createContext, use, useEffect, useState, type ReactNode } from "react";
import { AppState } from "react-native";
import { z } from "zod";
import { deletionDate } from "@/lib/age";
import { profileCardSchema, type ProfileCard } from "@/lib/domain";
import { DISPLAY_TIME_ZONE } from "@/lib/format";
import { supabase } from "@/data/supabase";

// Why a member is signed out when they didn't ask to be.
export type Notice = "expired" | "deleted";

// Whether the account may use Mavuno. A banned or age-deactivated account
// sees one screen and nothing else, as on the website (src/app/banned and
// src/app/deactivated). Suspended members can read, so they count as active.
const standingSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("active") }),
  z.object({ kind: z.literal("banned") }),
  z.object({ kind: z.literal("deactivated"), deletesAt: z.string() }),
]);
export type Standing = z.infer<typeof standingSchema>;

export type SessionState =
  | { kind: "loading" }
  | { kind: "signed-out"; notice: Notice | null }
  // `viewer` is null until the member's own profile has loaded.
  | { kind: "signed-in"; session: Session; viewer: ProfileCard | null; standing: Standing };

const SessionContext = createContext<SessionState>({ kind: "loading" });

export const useSession = () => use(SessionContext);

export function useViewer() {
  const state = useSession();
  return state.kind === "signed-in" ? state.viewer : null;
}

const VIEWER_COLUMNS = "id, username, display_name, avatar_url, colour:effective_colour, account_type, org_verified";

const settingsRow = z.object({ banned_at: z.string().nullable(), age_deactivated_at: z.string().nullable() });

function toStanding(settings: z.infer<typeof settingsRow>): Standing {
  if (settings.banned_at) return { kind: "banned" };
  if (settings.age_deactivated_at) return { kind: "deactivated", deletesAt: deletionDate(settings.age_deactivated_at) };
  return { kind: "active" };
}

async function loadViewer(userId: string) {
  const [profile, settings] = await Promise.all([
    supabase.from("profiles").select(VIEWER_COLUMNS).eq("id", userId).maybeSingle(),
    supabase.from("profile_settings").select("banned_at, age_deactivated_at").eq("id", userId).maybeSingle(),
  ]);
  const viewer = profile.data ? profileCardSchema.safeParse(profile.data).data ?? null : null;
  const standing = settings.data ? toStanding(settingsRow.parse(settings.data)) : null;
  return { viewer, standing };
}

// The last known standing is kept so a banned member's next launch opens on
// the notice, not on a feed that then disappears.
const standingKey = (userId: string) => `mavuno-standing.${userId}`;

const storedStanding = z.string().transform((stored, context) => {
  try {
    return JSON.parse(stored);
  } catch {
    context.issues.push({ code: "custom", message: "Not JSON", input: stored });
    return z.NEVER;
  }
}).pipe(standingSchema);

function readStanding(userId: string): Standing {
  return storedStanding.safeParse(localStorage.getItem(standingKey(userId))).data ?? { kind: "active" };
}

// Operations counts members active each day, as the website's proxy does:
// once a day per member, Sydney time.
const SEEN_KEY = "mavuno-seen";
function markSeen(userId: string) {
  const seen = `${new Intl.DateTimeFormat("en-CA", { timeZone: DISPLAY_TIME_ZONE }).format(new Date())}.${userId}`;
  if (localStorage.getItem(SEEN_KEY) === seen) return;
  void supabase.rpc("mark_seen").then(({ error }) => {
    if (!error) localStorage.setItem(SEEN_KEY, seen);
  });
}

// Set while a sign-out the member asked for (or deletion) is under way, so the
// signed-out screen can tell it from a session that expired on its own.
let leaving: Notice | "chosen" | null = null;

export async function signOut(notice: Notice | null = null) {
  leaving = notice ?? "chosen";
  localStorage.removeItem(SEEN_KEY);
  const { data } = await supabase.auth.getSession();
  if (data.session) localStorage.removeItem(standingKey(data.session.user.id));
  // A deleted account has no session left on the server to end. Otherwise
  // every device signs out, which is what "Sign out" promises.
  await supabase.auth.signOut({ scope: notice === "deleted" ? "local" : "global" });
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SessionState>({ kind: "loading" });
  const userId = state.kind === "signed-in" ? state.session.user.id : null;

  useEffect(() => {
    // Fires once at start with the stored session, then on every change.
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (!session) {
        // SIGNED_OUT without a sign-out of our own means the refresh token was refused.
        const notice = event === "SIGNED_OUT" && leaving !== "chosen" ? (leaving ?? "expired") : null;
        leaving = null;
        setState({ kind: "signed-out", notice });
        return;
      }
      setState((current) => {
        const same = current.kind === "signed-in" && current.session.user.id === session.user.id;
        return { kind: "signed-in", session, viewer: same ? current.viewer : null, standing: same ? current.standing : readStanding(session.user.id) };
      });
    });
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!userId) return;
    let current = true;
    void loadViewer(userId).then(({ viewer, standing }) => {
      if (!current) return;
      if (standing) localStorage.setItem(standingKey(userId), JSON.stringify(standing));
      setState((state) => {
        if (state.kind !== "signed-in" || state.session.user.id !== userId) return state;
        return { ...state, viewer: viewer ?? state.viewer, standing: standing ?? state.standing };
      });
    });
    markSeen(userId);
    const subscription = AppState.addEventListener("change", (appState) => {
      if (appState === "active") markSeen(userId);
    });
    return () => {
      current = false;
      subscription.remove();
    };
  }, [userId]);

  return <SessionContext value={state}>{children}</SessionContext>;
}
