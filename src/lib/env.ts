import { z } from "zod";

const publicSchema = z.object({
  supabaseUrl: z.url(),
  supabaseKey: z.string().min(1),
  siteUrl: z.url(),
  googleAuth: z.boolean(),
  fathomSiteId: z.string().regex(/^[A-Z0-9]+$/).optional(),
  googleAnalyticsId: z.string().regex(/^G-[A-Z0-9]+$/).optional(),
});

// Next.js only inlines NEXT_PUBLIC_ variables that are read by their full name.
export const publicEnv = publicSchema.parse({
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
  supabaseKey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  siteUrl: process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
  googleAuth: process.env.NEXT_PUBLIC_AUTH_GOOGLE === "true",
  fathomSiteId: process.env.NEXT_PUBLIC_FATHOM_SITE_ID || undefined,
  googleAnalyticsId: process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID || undefined,
});
