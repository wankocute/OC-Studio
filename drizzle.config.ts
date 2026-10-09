import { loadEnvConfig } from "@next/env";
import { defineConfig } from "drizzle-kit";

// Load .env / .env.local with the same precedence as Next.js.
loadEnvConfig(process.cwd());

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL chưa được cấu hình. Tạo .env.local từ .env.example.");
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema/index.ts",
  out: "./src/db/migrations",
  dbCredentials: { url: databaseUrl },
  strict: true,
  verbose: true,
});
