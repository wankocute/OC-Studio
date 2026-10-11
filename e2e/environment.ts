import path from "node:path";

import { resolveTestDatabaseUrl } from "../src/test/test-database";

/** E2E runs the app against its own database and media folder — never the developer's data. */
export const E2E_DATABASE_URL = resolveTestDatabaseUrl("_e2e_test");
export const E2E_MEDIA_DIR = path.join(process.cwd(), "storage", "e2e-test");
export const E2E_PORT = Number(process.env.E2E_PORT ?? 3210);

/** Login for the E2E server only — unrelated to any real deployment. */
export const E2E_PASSWORD = "e2e-mat-khau";
export const E2E_AUTH_SECRET = "e2e-secret-0123456789abcdef0123456789";
/** Session saved by `auth.setup.ts` and reused by every test (git-ignored). */
export const E2E_SESSION_FILE = path.join(process.cwd(), "e2e", ".auth", "session.json");
