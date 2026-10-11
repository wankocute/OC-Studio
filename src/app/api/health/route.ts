import { connection } from "next/server";

import { checkDatabaseHealth } from "@/db/health";
import { rejectUnauthenticatedRequest } from "@/features/auth/server/session";

/** GET /api/health — liveness of the app and PostgreSQL connectivity. Read-only. */
export async function GET() {
  await connection();
  const denied = await rejectUnauthenticatedRequest();
  if (denied) return denied;
  const database = await checkDatabaseHealth();
  const ok = database.status === "connected";

  return Response.json(
    { status: ok ? "ok" : "degraded", database, timestamp: new Date().toISOString() },
    { status: ok ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
