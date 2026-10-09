import { connection } from "next/server";

import { checkDatabaseHealth } from "@/db/health";
import { messages } from "@/i18n";

import { StatusRow } from "./status-row";

/** Server component: checks PostgreSQL at request time (never at build time). */
export async function DatabaseStatus() {
  await connection();
  const health = await checkDatabaseHealth();

  switch (health.status) {
    case "connected":
      return (
        <StatusRow
          label={messages.status.database}
          tone="success"
          value={messages.status.connected}
          detail={`${health.database} · PostgreSQL ${health.serverVersion} · ${health.latencyMs} ms`}
        />
      );
    case "not_configured":
      return (
        <StatusRow
          label={messages.status.database}
          tone="warning"
          value={messages.status.notConfigured}
          detail={messages.status.notConfiguredHint}
        />
      );
    case "error":
      return (
        <StatusRow
          label={messages.status.database}
          tone="error"
          value={messages.status.error}
          detail={health.message}
        />
      );
  }
}

export function DatabaseStatusFallback() {
  return (
    <StatusRow label={messages.status.database} tone="pending" value={messages.status.checking} />
  );
}
