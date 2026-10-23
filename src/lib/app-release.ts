import { z } from "zod";

// What the app checks when it opens (served at /api/app-release). A build
// older than minimumBuild (ios.buildNumber in mobile/app.json) stops at Update
// required, so raise it, and deploy, when a change here or in the database
// would break the builds people still have. storeUrl is the app's App Store
// page; set it once the app is listed, before raising minimumBuild.
// Gating builds without a store link would leave people on Update required
// with no way forward, so a minimum above 1 needs the link.
export const appReleaseSchema = z
  .object({
    minimumBuild: z.number().int().nonnegative(),
    storeUrl: z.url().nullable(),
  })
  .refine((release) => release.minimumBuild <= 1 || release.storeUrl !== null, "Set storeUrl before raising minimumBuild.");

export type AppRelease = z.infer<typeof appReleaseSchema>;

export const APP_RELEASE: AppRelease = appReleaseSchema.parse({ minimumBuild: 1, storeUrl: null });
