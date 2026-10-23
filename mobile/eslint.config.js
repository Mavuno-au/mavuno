const { defineConfig } = require("eslint/config");
const expoConfig = require("eslint-config-expo/flat");

// The phone app's JavaScript engine (Hermes) lacks the newest array methods
// and doesn't fill in named regular expression groups, and src/lib runs there too.
const HERMES_GAPS = [
  ...["toSorted", "toReversed", "toSpliced", "findLast", "findLastIndex", "with"].map((name) => ({
    selector: `CallExpression > MemberExpression.callee[property.name="${name}"]`,
    message: `${name} isn't in the app's JavaScript engine. Copy and sort, or loop, instead.`,
  })),
  { selector: "MemberExpression[property.name='groups'][object.name=/^match/]", message: "Named regex groups aren't filled in on the app. Use numbered groups." },
];

// The website's rules (../AGENTS.md), on Expo's base config.
module.exports = defineConfig([
  expoConfig,
  {
    rules: {
      "no-console": "error",
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-non-null-assertion": "error",
      "@typescript-eslint/consistent-type-imports": "error",
      // No `as` casts; `as const` is still allowed.
      "@typescript-eslint/consistent-type-assertions": ["error", { assertionStyle: "never" }],
      // Apostrophes in JSX text are safe; React escapes text.
      "react/no-unescaped-entities": "off",
      "no-restricted-syntax": ["error", ...HERMES_GAPS],
    },
  },
  { ignores: ["dist/*", ".expo/*", "ios/*", "android/*"] },
]);
