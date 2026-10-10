import path from "node:path";

import { resolveTestDatabaseUrl } from "../src/test/test-database";

/** E2E runs the app against its own database and media folder — never the developer's data. */
export const E2E_DATABASE_URL = resolveTestDatabaseUrl("_e2e_test");
export const E2E_MEDIA_DIR = path.join(process.cwd(), "storage", "e2e-test");
export const E2E_PORT = Number(process.env.E2E_PORT ?? 3210);
