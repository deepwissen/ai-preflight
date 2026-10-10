import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    globals: true,
    environment: "node",
  },
  // Detection-engine coverage now lives in @deepwissen/preflight-core.
  // This repo covers the VS Code platform/UI layer (minimal unit surface here).
});
