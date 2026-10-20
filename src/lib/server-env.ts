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
  })
  .parse(process.env);
