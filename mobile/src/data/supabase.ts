import { createClient } from "@supabase/supabase-js";
import { AppState } from "react-native";
import { env } from "@/data/env";
import { sessionStore } from "@/data/session-store";

export const supabase = createClient(env.supabaseUrl, env.supabaseKey, {
  auth: {
    storage: sessionStore,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

// Timers don't run in the background, so refresh only while the app is open.
AppState.addEventListener("change", (state) => {
  if (state === "active") void supabase.auth.startAutoRefresh();
  else void supabase.auth.stopAutoRefresh();
});
