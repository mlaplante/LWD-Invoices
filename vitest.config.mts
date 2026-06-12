import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    exclude: ["**/node_modules/**", "**/.worktrees/**", "**/dist/**"],
    coverage: {
      provider: "v8",
      // json-summary + json are required by vitest-coverage-report-action in CI
      reporter: ["text", "json-summary", "json"],
      reportOnFailure: true,
    },
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
