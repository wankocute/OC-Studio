export type DatabaseErrorReason =
  | "connection_refused"
  | "authentication_failed"
  | "database_not_found"
  | "timeout"
  | "invalid_config"
  | "unknown";

const REASON_MESSAGES: Record<DatabaseErrorReason, string> = {
  connection_refused: "Không kết nối được tới PostgreSQL. Kiểm tra service và host/port.",
  authentication_failed: "Sai tên đăng nhập hoặc mật khẩu PostgreSQL.",
  database_not_found: "Database trong DATABASE_URL chưa tồn tại.",
  timeout: "Kết nối tới PostgreSQL bị quá thời gian chờ.",
  invalid_config: "DATABASE_URL không hợp lệ. Kiểm tra lại định dạng trong .env.local.",
  unknown: "Lỗi không xác định khi kết nối PostgreSQL.",
};

const REASON_BY_CODE: Record<string, DatabaseErrorReason> = {
  ECONNREFUSED: "connection_refused",
  ENOTFOUND: "connection_refused",
  EHOSTUNREACH: "connection_refused",
  ETIMEDOUT: "timeout",
  "28P01": "authentication_failed",
  "28000": "authentication_failed",
  "3D000": "database_not_found",
};

/** Drizzle wraps driver errors, so walk the `cause` chain looking for a pg / Node error code. */
export function findErrorCode(error: unknown): string | undefined {
  let current = error;
  for (let depth = 0; depth < 5 && typeof current === "object" && current !== null; depth++) {
    if ("code" in current && typeof current.code === "string") return current.code;
    if ("errors" in current && Array.isArray(current.errors)) {
      // AggregateError (e.g. ECONNREFUSED on both IPv4 and IPv6 localhost)
      current = current.errors[0];
      continue;
    }
    current = "cause" in current ? current.cause : undefined;
  }
  return undefined;
}

function isTimeout(error: unknown): boolean {
  let current = error;
  for (let depth = 0; depth < 5 && current instanceof Error; depth++) {
    if (/timeout/i.test(current.message)) return true;
    current = current.cause;
  }
  return false;
}

/** Map a pg / Node network error to a stable reason plus a user-facing (Vietnamese) message. */
export function describeDatabaseError(error: unknown): {
  reason: DatabaseErrorReason;
  message: string;
} {
  const code = findErrorCode(error);
  const reason: DatabaseErrorReason =
    (code && REASON_BY_CODE[code]) || (isTimeout(error) ? "timeout" : "unknown");
  return describeReason(reason);
}

export function describeReason(reason: DatabaseErrorReason): {
  reason: DatabaseErrorReason;
  message: string;
} {
  return { reason, message: REASON_MESSAGES[reason] };
}
