import type { Session } from "@supabase/supabase-js";
import { createContext, use, useEffect, useState, type ReactNode } from "react";
import { AppState } from "react-native";
import { profileCardSchema, type ProfileCard } from "@/lib/domain";
import { DISPLAY_TIME_ZONE } from "@/lib/format";
import { supabase } from "@/data/supabase";

export type SessionState =
  | { kind: "loading" }
  | { kind: "signed-out" }
  // `viewer` is null until the member's own profile has loaded.
  | { kind: "signed-in"; session: Session; viewer: ProfileCard | null };

const SessionContext = createContext<SessionState>({ kind: "loading" });

export const useSession = () => use(SessionContext);

export function useViewer() {
  const state = useSession();
  return state.kind === "signed-in" ? state.viewer : null;
}

const VIEWER_COLUMNS = "id, username, display_name, avatar_url, colour:effective_colour, account_type, org_verified";

async function loadViewer(userId: string) {
  const { data, error } = await supabase.from("profiles").select(VIEWER_COLUMNS).eq("id", userId).maybeSingle();
  if (error || !data) return null;
  return profileCardSchema.parse(data);
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

export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SessionState>({ kind: "loading" });
  const userId = state.kind === "signed-in" ? state.session.user.id : null;

  useEffect(() => {
    // Fires once at start with the stored session, then on every change.
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setState((current) => {
        if (!session) return { kind: "signed-out" };
        const viewer = current.kind === "signed-in" && current.session.user.id === session.user.id ? current.viewer : null;
        return { kind: "signed-in", session, viewer };
      });
    });
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!userId) return;
    let current = true;
    void loadViewer(userId).then((viewer) => {
      if (current && viewer) setState((state) => (state.kind === "signed-in" && state.session.user.id === userId ? { ...state, viewer } : state));
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
