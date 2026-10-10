import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { connectTestDatabase } from "@/test/integration-context";
import {
  MIGRATIONS_FOLDER,
  migrateTestDatabase,
  PROJECT_TABLES,
  resolveTestDatabaseUrl,
} from "@/test/test-database";

const { db } = connectTestDatabase();

describe("database migrations", () => {
  it("are tracked, so running them again changes nothing", async () => {
    const count = async () =>
      Number(
        (
          (await db.execute(sql`select count(*)::int as n from drizzle.__drizzle_migrations`))
            .rows[0] as { n: number }
        ).n,
      );
    const before = await count();
    expect(before).toBeGreaterThan(0);
    await migrateTestDatabase(resolveTestDatabaseUrl());
    expect(await count()).toBe(before);
  });

  it("create exactly the confirmed project tables", async () => {
    const { rows } = await db.execute(sql`
      select table_name from information_schema.tables
      where table_schema = 'public' and table_type = 'BASE TABLE' order by table_name`);
    expect(rows.map((row) => (row as { table_name: string }).table_name)).toEqual(
      [...PROJECT_TABLES].sort(),
    );
  });

  it("contain no destructive statements", () => {
    const files = readdirSync(MIGRATIONS_FOLDER).filter((file) => file.endsWith(".sql"));
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const statements = readFileSync(path.join(MIGRATIONS_FOLDER, file), "utf8").replace(
        /ON DELETE \w+/gi,
        "",
      );
      expect(statements, file).not.toMatch(
        /\b(DROP|TRUNCATE|DELETE\s+FROM|ALTER\s+TABLE\s+\S+\s+RENAME)\b/i,
      );
    }
  });
});
