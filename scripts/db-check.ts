/**
 * Verify PostgreSQL connectivity using the app's own database module.
 * Usage: pnpm db:check — read-only, runs a single SELECT and changes nothing.
 */
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

async function main(): Promise<number> {
  // Import after env is loaded so the db module sees DATABASE_URL.
  const { checkDatabaseHealth } = await import("../src/db/health");
  const { closeDb } = await import("../src/db/index");

  const health = await checkDatabaseHealth();
  await closeDb();

  switch (health.status) {
    case "connected":
      console.log(
        `✔ Kết nối PostgreSQL thành công — database "${health.database}", ` +
          `PostgreSQL ${health.serverVersion}, ${health.latencyMs} ms`,
      );
      return 0;
    case "not_configured":
      console.error("✖ DATABASE_URL chưa được cấu hình. Tạo .env.local từ .env.example.");
      return 1;
    case "error":
      console.error(`✖ ${health.message} (reason: ${health.reason})`);
      return 1;
  }
}

main().then(
  (code) => process.exit(code),
  (error: unknown) => {
    console.error("✖ Lỗi khi kiểm tra kết nối:", error instanceof Error ? error.message : error);
    process.exit(1);
  },
);
