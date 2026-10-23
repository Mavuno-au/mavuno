import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// The phone app's JavaScript engine (Hermes) lacks the newest array methods
// and doesn't fill in named regular expression groups, and src/lib runs there too.
const HERMES_GAPS = [
  ...["toSorted", "toReversed", "toSpliced", "findLast", "findLastIndex", "with"].map((name) => ({
    selector: `CallExpression > MemberExpression.callee[property.name="${name}"]`,
    message: `${name} isn't in the app's JavaScript engine. Copy and sort, or loop, instead.`,
  })),
  { selector: "MemberExpression[property.name='groups'][object.name=/^match/]", message: "Named regex groups aren't filled in on the app. Use numbered groups." },
];

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      "no-console": "error",
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-non-null-assertion": "error",
      "@typescript-eslint/consistent-type-imports": "error",
      // No `as` casts; `as const` is still allowed.
      "@typescript-eslint/consistent-type-assertions": ["error", { assertionStyle: "never" }],
      // Member images, avatars and link-card images come from arbitrary hosts
      // (Supabase Storage, Google, any site's og:image), which next/image cannot allowlist.
      "@next/next/no-img-element": "off",
      // Apostrophes in JSX text are safe; React escapes text.
      "react/no-unescaped-entities": "off",
    },
  },
  {
    files: ["src/lib/**/*.ts"],
    ignores: ["src/lib/data/**", "src/lib/**/*.test.ts"],
    rules: { "no-restricted-syntax": ["error", ...HERMES_GAPS] },
  },
  {
    files: ["scripts/**"],
    rules: { "no-console": "off" },
  },
  // .claude holds installed agent skills, not app code. The phone app has its own config.
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts", "supabase/**", ".claude/**", "mobile/**"]),
]);
