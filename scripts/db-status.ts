import { loadEnvConfig } from "@next/env";
import { Client } from "pg";

loadEnvConfig(process.cwd());
async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  try {
    if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not configured");
    await client.connect();
    console.log(
      (
        await client.query(
          "select table_name from information_schema.tables where table_schema = 'public' order by 1",
        )
      ).rows,
    );
    const journal = await client.query(
      "select to_regclass('drizzle.__drizzle_migrations') as journal",
    );
    if (journal.rows[0].journal)
      console.log(
        (
          await client.query(
            "select id, hash, created_at from drizzle.__drizzle_migrations order by created_at",
          )
        ).rows,
      );
  } finally {
    await client.end();
  }
}
void main();
