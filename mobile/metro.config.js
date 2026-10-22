// The app imports the website's plain modules from ../src/lib (domain types,
// zod schemas, text and date helpers) as `@/lib/*`, so they are never copied.
const path = require("node:path");
const { getDefaultConfig } = require("expo/metro-config");

const projectRoot = __dirname;
const shared = path.resolve(projectRoot, "../src/lib");

const config = getDefaultConfig(projectRoot);

config.watchFolders = [shared];

// Packages a shared module imports (zod) come from the app's node_modules,
// never the website's, so both sides use one copy of each.
const resolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const bare = !moduleName.startsWith(".") && !moduleName.startsWith("/") && !moduleName.startsWith("@/");
  const fromShared = context.originModulePath.startsWith(shared + path.sep);
  const next = bare && fromShared ? { ...context, originModulePath: path.join(projectRoot, "package.json") } : context;
  return (resolveRequest ?? next.resolveRequest)(next, moduleName, platform);
};

module.exports = config;
