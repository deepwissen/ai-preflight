import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    globals: true,
    environment: "node",
    // Platform shells import `vscode`, which has no runtime outside the IDE host.
    // Alias it to a test-controllable mock (test/mocks/vscode.ts) for unit tests.
    alias: {
      vscode: fileURLToPath(new URL("./test/mocks/vscode.ts", import.meta.url)),
    },
  },
});
