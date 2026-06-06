import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Generated files
    "src/generated/**",
    ".netlify/**",
    ".worktrees/**",
  ]),
  {
    // React Compiler advisories (eslint-plugin-react-hooks v6). These flag
    // idiomatic, working effects (mount-time browser reads, prop→state sync,
    // form resets) across the app. We keep them visible as warnings and burn
    // them down deliberately rather than risk-refactoring shipping UI in bulk.
    rules: {
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/immutability": "warn",
    },
  },
  {
    // Test code leans on `any` casts and partial mocks of Prisma/tRPC where
    // full typing adds noise without catching bugs. Relax there only.
    files: ["src/test/**/*.{ts,tsx}", "**/*.test.{ts,tsx}"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": "off",
      "@typescript-eslint/no-unused-expressions": "off",
    },
  },
]);

export default eslintConfig;
