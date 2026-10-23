import type { Session } from "@supabase/supabase-js";
import { createContext, use, useEffect, useState, type ReactNode } from "react";
import { AppState } from "react-native";
import { z } from "zod";
import { DISPLAY_TIME_ZONE } from "@/lib/format";
import { toViewer, VIEWER_SELECT, type Viewer } from "@/lib/viewer-row";
import { clearDrafts } from "@/data/drafts";
import { unregisterPush } from "@/data/push";
import { supabase } from "@/data/supabase";
import { toast } from "@/ui/toast";
import { createEvent } from "@/util/events";

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
type Standing = z.infer<typeof standingSchema>;

type SessionState =
  | { kind: "loading" }
  | { kind: "signed-out"; notice: Notice | null }
  // `viewer` is null until the member's own profile has loaded.
  | { kind: "signed-in"; session: Session; viewer: Viewer | null; standing: Standing };

const SessionContext = createContext<SessionState>({ kind: "loading" });

export const useSession = () => use(SessionContext);

export function useViewer() {
  const state = useSession();
  return state.kind === "signed-in" ? state.viewer : null;
}

function standingOf(viewer: Viewer): Standing {
  if (viewer.banned) return { kind: "banned" };
  if (viewer.age.kind === "deactivated") return { kind: "deactivated", deletesAt: viewer.age.deletesAt };
  return { kind: "active" };
}

// The website's getViewer (src/lib/viewer.ts), with the same select and parse.
async function loadViewer(userId: string) {
  const { data } = await supabase.from("profiles").select(VIEWER_SELECT).eq("id", userId).maybeSingle();
  let viewer: Viewer | null = null;
  try {
    viewer = data ? toViewer(data) : null;
  } catch {
    // A row this build can't read leaves the last one shown.
  }
  return { viewer, standing: viewer ? standingOf(viewer) : null };
}

// After something changes the member's own row (accepting the rules, editing
// the profile, joining a team), the session reads it again.
const viewerChanged = createEvent();
export const reloadViewer = viewerChanged.emit;

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
  const scope = notice === "deleted" ? "local" : "global";
  // Every session ends, so no phone should keep getting this member's pushes.
  if (scope === "global") await supabase.rpc("unregister_my_push_tokens");
  const { error } = await supabase.auth.signOut({ scope });
  if (!error || scope === "local") return;
  // When the server can't be reached this phone usually signs out anyway but
  // the others don't, and someone signing out because they lost a phone needs to know.
  const { data: after } = await supabase.auth.getSession();
  if (after.session) {
    leaving = null;
    toast("Couldn't sign out. Check your connection and try again.", { tone: "error" });
  } else {
    toast("Signed out on this phone only. Your other phones stay signed in until you sign out again with a connection.", { duration: 8000 });
  }
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
        // However the member left (Sign out, deleting the account, a refused
        // session), the next person on this phone doesn't see their drafts
        // or get their notifications.
        if (event === "SIGNED_OUT") {
          clearDrafts();
          void unregisterPush();
        }
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
    const read = () =>
      void loadViewer(userId).then(({ viewer, standing }) => {
        if (!current) return;
        if (standing) localStorage.setItem(standingKey(userId), JSON.stringify(standing));
        setState((state) => {
          if (state.kind !== "signed-in" || state.session.user.id !== userId) return state;
          return { ...state, viewer: viewer ?? state.viewer, standing: standing ?? state.standing };
        });
      });
    read();
    markSeen(userId);
    const stopListening = viewerChanged.on(read);
    // A suspension can end, or a moderator act, while the app is away.
    const subscription = AppState.addEventListener("change", (appState) => {
      if (appState !== "active") return;
      markSeen(userId);
      read();
    });
    return () => {
      current = false;
      stopListening();
      subscription.remove();
    };
  }, [userId]);

  return <SessionContext value={state}>{children}</SessionContext>;
}
