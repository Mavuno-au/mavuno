// Which deployment this server is. Vercel sets these at build and run time;
// elsewhere there is nothing to compare, and the update notice stays quiet.
export const buildId = process.env.VERCEL_DEPLOYMENT_ID ?? process.env.VERCEL_GIT_COMMIT_SHA ?? null;
