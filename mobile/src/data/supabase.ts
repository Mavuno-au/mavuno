import "expo-sqlite/localStorage/install";
import { createClient } from "@supabase/supabase-js";
import { AppState } from "react-native";
import { env } from "@/data/env";

export const supabase = createClient(env.supabaseUrl, env.supabaseKey, {
  auth: {
    // The session survives restarts in the app's own storage.
    storage: localStorage,
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
