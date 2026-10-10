import { defineConfig } from "vitest/config";

/**
 * Integration tests against a real PostgreSQL test database (`*.int.test.ts`).
 * Files run one at a time because they share the database.
 */
export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    environment: "node",
    include: ["src/**/*.int.test.ts"],
    setupFiles: ["./src/test/integration-setup.ts"],
    globalSetup: ["./src/test/integration-global-setup.ts"],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
