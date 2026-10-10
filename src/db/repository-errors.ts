import "server-only";

import { findErrorCode } from "./errors";

/**
 * Stable, structured repository errors. Callers (Server Actions in later tasks) switch on `code`
 * and may show `details`; driver errors never leave the repository — they become
 * `database_error` with the original kept only as `cause` for server-side logging.
 */
export type RepositoryErrorCode =
  | "validation_failed"
  | "not_found"
  | "revision_conflict"
  | "reference_target_missing"
  | "definition_breaking_change"
  | "definition_in_use"
  | "definition_deprecated"
  | "duplicate"
  | "unsupported_schema"
  | "concurrent_modification"
  | "database_error";

export type ValidationIssue = { path: string; message: string };

export type RepositoryErrorDetails = {
  validation_failed: { issues: ValidationIssue[] };
  not_found: { entity: string; id: string };
  revision_conflict: { id: string; expectedRevision: number; actualRevision: number };
  reference_target_missing: { characterIds: string[] };
  definition_breaking_change: { key: string; changes: { path: string; reason: string }[] };
  definition_in_use: { key: string };
  definition_deprecated: { keys: string[] };
  duplicate: { constraint?: string };
  unsupported_schema: { id: string; schemaVersion: number; reason: string };
  concurrent_modification: Record<string, never>;
  database_error: Record<string, never>;
};

const MESSAGES: Record<RepositoryErrorCode, string> = {
  validation_failed: "Dữ liệu không hợp lệ.",
  not_found: "Không tìm thấy dữ liệu.",
  revision_conflict: "Dữ liệu đã được thay đổi ở nơi khác. Hãy tải lại trước khi lưu.",
  reference_target_missing: "Có tham chiếu tới nhân vật không tồn tại hoặc đã bị xóa.",
  definition_breaking_change: "Thay đổi định nghĩa sẽ làm dữ liệu hiện có mất hợp lệ.",
  definition_in_use: "Định nghĩa đang được sử dụng.",
  definition_deprecated: "Không thể dùng định nghĩa đã ngừng sử dụng cho dữ kiện mới.",
  duplicate: "Dữ liệu bị trùng.",
  unsupported_schema: "Dữ liệu được lưu bằng phiên bản schema không thể chuyển đổi tự động.",
  concurrent_modification: "Thao tác bị xung đột với một thao tác khác. Hãy thử lại.",
  database_error: "Lỗi cơ sở dữ liệu.",
};

export class RepositoryError<C extends RepositoryErrorCode = RepositoryErrorCode> extends Error {
  readonly code: C;
  readonly details: RepositoryErrorDetails[C];

  constructor(code: C, details: RepositoryErrorDetails[C], options?: { cause?: unknown }) {
    super(MESSAGES[code], options);
    this.name = "RepositoryError";
    this.code = code;
    this.details = details;
  }
}

export function isRepositoryError<C extends RepositoryErrorCode>(
  error: unknown,
  code?: C,
): error is RepositoryError<C> {
  return error instanceof RepositoryError && (code === undefined || error.code === code);
}

function findConstraint(error: unknown): string | undefined {
  let current = error;
  for (let depth = 0; depth < 5 && typeof current === "object" && current !== null; depth++) {
    if ("constraint" in current && typeof current.constraint === "string")
      return current.constraint;
    current = "cause" in current ? current.cause : undefined;
  }
  return undefined;
}

/** Map anything thrown inside a repository to a `RepositoryError`. */
export function toRepositoryError(error: unknown): RepositoryError {
  if (error instanceof RepositoryError) return error;
  switch (findErrorCode(error)) {
    case "23505":
      return new RepositoryError(
        "duplicate",
        { constraint: findConstraint(error) },
        { cause: error },
      );
    case "40P01": // deadlock detected
    case "40001": // serialization failure
      return new RepositoryError("concurrent_modification", {}, { cause: error });
    default:
      return new RepositoryError("database_error", {}, { cause: error });
  }
}

/** Run a repository operation, converting every failure to a `RepositoryError`. */
export async function guard<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    throw toRepositoryError(error);
  }
}
