import react from "@vitejs/plugin-react";
import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: { tsconfigPaths: true },
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
    // Integration tests need PostgreSQL: `pnpm test:integration`.
    exclude: [...configDefaults.exclude, "src/**/*.int.test.ts"],
    css: false,
  },
});
