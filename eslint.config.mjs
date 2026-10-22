import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      "no-console": "error",
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-non-null-assertion": "error",
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/switch-exhaustiveness-check": "off",
      // Member images, avatars and link-card images come from arbitrary hosts
      // (Supabase Storage, Google, any site's og:image), which next/image cannot allowlist.
      "@next/next/no-img-element": "off",
      // Apostrophes in JSX text are safe; React escapes text.
      "react/no-unescaped-entities": "off",
    },
  },
  {
    files: ["scripts/**"],
    rules: { "no-console": "off" },
  },
  // .claude holds installed agent skills, not app code. The phone app has its own config.
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts", "supabase/**", ".claude/**", "mobile/**"]),
]);
