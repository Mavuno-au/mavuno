const { defineConfig } = require("eslint/config");
const expoConfig = require("eslint-config-expo/flat");

// The website's rules (../AGENTS.md), on Expo's base config.
module.exports = defineConfig([
  expoConfig,
  {
    rules: {
      "no-console": "error",
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-non-null-assertion": "error",
      "@typescript-eslint/consistent-type-imports": "error",
      // Apostrophes in JSX text are safe; React escapes text.
      "react/no-unescaped-entities": "off",
    },
  },
  { ignores: ["dist/*", ".expo/*", "ios/*", "android/*"] },
]);
