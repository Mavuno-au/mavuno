import "server-only";
import { z } from "zod";

const optional = z
  .string()
  .optional()
  .transform((value) => (value ? value : undefined));

export const serverEnv = z
  .object({
    TRANSLATE_API_URL: optional.pipe(z.url().optional()),
    TRANSLATE_API_KEY: optional,
    SUPABASE_SERVICE_ROLE_KEY: optional,
    MAINTENANCE_SECRET: optional,
    // Search Console and Bing Webmaster Tools verification codes, if verifying by meta tag.
    GOOGLE_SITE_VERIFICATION: optional,
    BING_SITE_VERIFICATION: optional,
    // IndexNow tells Bing (and through it Copilot) about new pages; Vercel's cron sends CRON_SECRET.
    INDEXNOW_KEY: optional.pipe(z.string().regex(/^[A-Za-z0-9-]{8,128}$/).optional()),
    CRON_SECRET: optional,
    // The automatic safety check on held-back authors' posts runs only with this key.
    OPENAI_API_KEY: optional,
  })
  .parse(process.env);
