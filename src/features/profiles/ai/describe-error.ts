import "server-only";

import { messages } from "@/i18n";

import { AiError } from "./provider";

/**
 * Vietnamese message for an AI failure, with Google's own status/reason (already redacted) when
 * there is one. Never contains keys, facts or URLs.
 */
export function describeAiError(error: AiError): string {
  const diagnostic = error.diagnostic;
  const google = diagnostic
    ? [
        `HTTP ${diagnostic.httpStatus}`,
        diagnostic.status,
        diagnostic.reasons.join(", "),
        diagnostic.message,
      ]
        .filter(Boolean)
        .join("; ")
    : "";
  return [messages.profileAi.errors[error.code], google && `Google: ${google}`]
    .filter(Boolean)
    .join("\n");
}

export function toAiError(error: unknown): AiError {
  return error instanceof AiError ? error : new AiError("network");
}
