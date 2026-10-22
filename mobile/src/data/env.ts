import { z } from "zod";

// Expo inlines EXPO_PUBLIC_* at build time; they must be read by their full
// names for that to happen. Both Supabase values are public by design: row
// level security is what protects the data.
export const env = z
  .object({
    supabaseUrl: z.url(),
    supabaseKey: z.string().min(1),
    siteUrl: z.url().default("https://mavuno.au"),
  })
  .parse({
    supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL,
    supabaseKey: process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    siteUrl: process.env.EXPO_PUBLIC_SITE_URL || undefined,
  });

export const siteLink = (path: string) => new URL(path, env.siteUrl).href;
