/**
 * Result shape of every Server Action: never throws to the client, never leaks driver errors.
 * Server-only (imports repository errors): Client Components may only `import type` from here.
 */
import type { z } from "zod";

import { isRepositoryError, type RepositoryErrorCode } from "@/db/repository-errors";
import { messages } from "@/i18n";

import { fieldErrorsOf } from "./action-result-client";

export type ActionError = {
  code: RepositoryErrorCode | "invalid_input" | "upload_failed" | "unexpected";
  message: string;
  /** Field name → message, for forms. */
  fieldErrors?: Record<string, string>;
};

export type ActionResult<T = undefined> = { ok: true; data: T } | { ok: false; error: ActionError };

export function ok(): ActionResult;
export function ok<T>(data: T): ActionResult<T>;
export function ok<T>(data?: T): ActionResult<T | undefined> {
  return { ok: true, data };
}

export function fail(error: ActionError): { ok: false; error: ActionError } {
  return { ok: false, error };
}

export { fieldErrorsOf };

export function invalidInput(error: z.ZodError): { ok: false; error: ActionError } {
  return fail({
    code: "invalid_input",
    message: messages.errors.validation_failed,
    fieldErrors: fieldErrorsOf(error),
  });
}

/** Map a thrown error to an action failure. Unknown errors are logged server-side only. */
export function failFromError(error: unknown): { ok: false; error: ActionError } {
  if (isRepositoryError(error)) {
    switch (error.code) {
      case "revision_conflict":
        return fail({ code: error.code, message: messages.characters.revisionConflict });
      case "validation_failed": {
        const issues = (error.details as { issues?: { path: string; message: string }[] }).issues;
        const fieldErrors = Object.fromEntries(
          (issues ?? []).map((issue) => [issue.path.split(".")[0] || "form", issue.message]),
        );
        return fail({ code: error.code, message: messages.errors.validation_failed, fieldErrors });
      }
      case "not_found":
      case "duplicate":
      case "reference_target_missing":
      case "unsupported_schema":
      case "concurrent_modification":
      case "database_error":
        if (error.code === "database_error") console.error(error.cause ?? error);
        return fail({ code: error.code, message: messages.errors[error.code] });
      default:
        return fail({ code: error.code, message: error.message });
    }
  }
  console.error(error);
  return fail({ code: "unexpected", message: messages.common.unexpectedError });
}
